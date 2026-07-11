import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminForGroup } from "@/lib/admin";
import { getActiveYear } from "@/lib/rounds";

type SeedPair = { giverId: string; receiverId: string };

// POST /api/rounds/seed {groupId, year, pairs: [{giverId, receiverId}]}
// One-off (idempotently re-runnable) admin action: hand-record a PAST year's
// giver->receiver pairs so getPreviousYearExclusions has real history to
// exclude against from the group's very first real draw. Creates a
// finalized ("sent") Round for that year plus its Assignments. `year` must
// be strictly before the group's current active year - this backfills
// history, it never touches the current cycle (that stays generate/send).
export async function POST(request: NextRequest) {
  try {
    const { groupId, year, pairs } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const forbidden = await requireAdminForGroup(groupId);
    if (forbidden) return forbidden;

    const activeYear = await getActiveYear(groupId);
    if (!Number.isInteger(year) || year >= activeYear) {
      return NextResponse.json({ error: `year must be a past year before ${activeYear}` }, { status: 400 });
    }

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json({ error: "pairs must be a non-empty array" }, { status: 400 });
    }
    const seedPairs = pairs as SeedPair[];

    // Membership set: every giver/receiver must be a real person in this group.
    const people = await prisma.person.findMany({ where: { groupId }, select: { id: true } });
    const memberIds = new Set(people.map((p) => p.id));

    const hasStranger = seedPairs.some((p) => !memberIds.has(p.giverId) || !memberIds.has(p.receiverId));
    if (hasStranger) {
      return NextResponse.json({ error: "Every giver and receiver must belong to this group" }, { status: 400 });
    }

    const hasSelfPair = seedPairs.some((p) => p.giverId === p.receiverId);
    if (hasSelfPair) {
      return NextResponse.json({ error: "A person cannot be their own giver" }, { status: 400 });
    }

    // Assignment has @@unique([giverId, year]) - a giver can only appear once.
    const giverIds = seedPairs.map((p) => p.giverId);
    if (new Set(giverIds).size !== giverIds.length) {
      return NextResponse.json({ error: "Each giver can appear at most once" }, { status: 400 });
    }

    // Upsert the round first (need its id for the assignments below); array-form
    // $transaction only after, so no interactive transaction is ever needed.
    const round = await prisma.round.upsert({
      where: { groupId_year: { groupId, year } },
      update: { status: "sent" },
      create: { groupId, year, status: "sent" },
    });

    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { groupId, year } }),
      ...seedPairs.map((p) =>
        prisma.assignment.create({
          data: {
            groupId,
            roundId: round.id,
            giverId: p.giverId,
            receiverId: p.receiverId,
            year,
          },
        })
      ),
    ]);

    return NextResponse.json({ year, seeded: seedPairs.length });
  } catch (error) {
    console.error("Seed round error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
