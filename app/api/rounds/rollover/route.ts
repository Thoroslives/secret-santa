import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminForGroup } from "@/lib/admin";
import { getActiveYear } from "@/lib/rounds";

// POST /api/rounds/rollover {groupId}
// One admin action that starts the group's next year: advance the
// active-year pointer (Group.year), materialize next year's round, and wipe
// this year's wishlists. Roster/tokens live on Person and blocks are
// group-scoped, so both carry forward automatically without any code here.
// Assignments/rounds/suggestions are year/round-scoped, so they simply stay
// put under the old year (that IS the retained history) - the new round has
// none yet, which is what makes the new year look "fresh". Blocked while the
// current round is `generated` so an unsent draw is never silently abandoned;
// `draft` (nothing generated), `sent` (finished), or no round at all all
// allow rollover. The year is always server-resolved from Group.year, never
// client-supplied.
export async function POST(request: NextRequest) {
  try {
    const { groupId } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const forbidden = await requireAdminForGroup(groupId);
    if (forbidden) return forbidden;

    const current = await getActiveYear(groupId);
    const next = current + 1;

    const currentRound = await prisma.round.findUnique({
      where: { groupId_year: { groupId, year: current } },
    });
    if (currentRound && currentRound.status === "generated") {
      return NextResponse.json(
        {
          error: `You have an unsent draw for ${current}. Send it or delete it before starting next year.`,
        },
        { status: 400 }
      );
    }

    const people = await prisma.person.findMany({
      where: { groupId },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.wishlistItem.deleteMany({ where: { personId: { in: people.map((p) => p.id) } } }),
      prisma.round.upsert({
        where: { groupId_year: { groupId, year: next } },
        update: {},
        create: { groupId, year: next },
      }),
      prisma.group.update({ where: { id: groupId }, data: { year: next } }),
    ]);

    return NextResponse.json({ year: next });
  } catch (error) {
    console.error("Rollover error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
