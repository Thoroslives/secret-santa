import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminForGroup } from "@/lib/admin";
import { ensureRound, getActiveYear, getPreviousYearExclusions } from "@/lib/rounds";
import { generateDraw } from "@/lib/secret-santa";

// POST /api/rounds/generate {groupId}
// Computes a constrained draw and persists it as `generated` (admin review
// state). Sends nothing - that is the separate /api/rounds/send action.
// Re-callable while the round is not yet `sent` to reroll. The year is
// always the group's active year, resolved server-side - never client-supplied.
export async function POST(request: NextRequest) {
  try {
    const { groupId } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const forbidden = await requireAdminForGroup(groupId);
    if (forbidden) return forbidden;

    const currentYear = await getActiveYear(groupId);
    const round = await ensureRound(groupId, currentYear);
    if (round.status === "sent") {
      return NextResponse.json(
        { error: "This round has already been sent; it can no longer be regenerated." },
        { status: 400 }
      );
    }

    const people = await prisma.person.findMany({
      where: { groupId, active: true },
      select: { id: true, name: true },
    });
    if (people.length < 3) {
      return NextResponse.json(
        { error: "You need at least 3 active people to generate a draw." },
        { status: 400 }
      );
    }

    const blocks = await prisma.block.findMany({ where: { groupId } });
    const pins = await prisma.forcedPin.findMany({ where: { roundId: round.id } });

    // How many recent rounds' pairs to exclude a repeat giftee from, so no one
    // gets the same person again too soon (PREVIOUS_YEAR_MEMORY).
    const memory =
      (await prisma.group.findUnique({ where: { id: groupId }, select: { previousYearMemory: true } }))
        ?.previousYearMemory ?? 1;
    const exclusions = await getPreviousYearExclusions(groupId, currentYear, memory);

    const result = generateDraw(people, {
      blocks: blocks.map((b) => [b.personAId, b.personBId] as [string, string]),
      pins: pins.map((p) => ({ giverId: p.giverId, receiverId: p.receiverId })),
      exclusions,
    });

    if (!result.ok) {
      // Infeasible: report plainly, leave the round in its current (draft) state.
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // Replace any prior generation for this group/year and flip to `generated`,
    // atomically so a partial draw is never persisted.
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { groupId, year: currentYear } }),
      ...result.assignments.map((a) =>
        prisma.assignment.create({
          data: {
            groupId,
            roundId: round.id,
            giverId: a.giverId,
            receiverId: a.receiverId,
            year: currentYear,
          },
        })
      ),
      prisma.round.update({ where: { id: round.id }, data: { status: "generated" } }),
    ]);

    // Named pairs for the admin review view (admin is not blind to the draw).
    const assignments = await prisma.assignment.findMany({
      where: { roundId: round.id },
      include: { giver: true, receiver: true },
      orderBy: { giver: { name: "asc" } },
    });

    return NextResponse.json({ status: "generated", count: assignments.length, assignments });
  } catch (error) {
    console.error("Generate round error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
