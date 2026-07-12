import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
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

    const forbidden = await requireAdmin();
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

// GET /api/rounds/seed?groupId=X&year=Y
// Read side of the seed feature, so the admin dashboard can show what has
// already been recorded and pre-fill the editable table. Returns the recorded
// giver->receiver pairs for `year` (defaults to last year), their count, and a
// summary of every PAST year that already has recorded pairs. Admin-only.
// Hand-seeded history and rolled-over real draws are the same "who gave to
// whom" record the current draw excludes against, so both surface here.
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const activeYear = await getActiveYear(groupId);

    // Every past year that already has recorded pairs, newest first - drives
    // the "recorded so far" summary so the admin can see history at a glance.
    const pastRounds = await prisma.round.findMany({
      where: { groupId, year: { lt: activeYear } },
      select: { year: true, _count: { select: { assignments: true } } },
      orderBy: { year: "desc" },
    });
    const seededYears = pastRounds
      .filter((r) => r._count.assignments > 0)
      .map((r) => ({ year: r.year, count: r._count.assignments }));

    // Pairs for the requested year (defaults to last year). Only past years are
    // read back - the seed table is about history, never the live current draw.
    const yearParam = parseInt(searchParams.get("year") ?? "", 10);
    const year = Number.isInteger(yearParam) ? yearParam : activeYear - 1;

    const assignments =
      year < activeYear
        ? await prisma.assignment.findMany({
            where: { groupId, year },
            select: { giverId: true, receiverId: true },
            orderBy: { giver: { name: "asc" } },
          })
        : [];
    const pairs = assignments.map((a) => ({ giverId: a.giverId, receiverId: a.receiverId }));

    return NextResponse.json({ year, activeYear, pairs, count: pairs.length, seededYears });
  } catch (error) {
    console.error("Seed history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
