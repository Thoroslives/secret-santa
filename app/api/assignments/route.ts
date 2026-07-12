import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getActiveYear, getRound, RESET_TO_DRAFT } from "@/lib/rounds";
import { snapshotOrRefuse } from "@/lib/db-snapshot";

// GET all assignments for a group. Admin: optional ?year= for a past year
// (history view), defaulting to the active year. Participant: always the
// active year, regardless of any ?year= - a participant can never look at
// another year's pairing by manipulating the query string.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // ADMIN: sees every pair for the round (this is the review view). The
    // super-admin owns every group, so there is no per-group check here.
    if (session.isAdmin) {
      const year = parseInt(searchParams.get("year") || "") || await getActiveYear(groupId);

      // The round travels SEPARATELY, and deliberately NOT as a per-row `include`. Riding
      // on the rows, a round holding zero assignments shipped no status at all - so the
      // dashboard, which branched on `assignments.length`, could not tell "no draw yet"
      // from "a draw was sent and its rows were later destroyed". It offered a Generate
      // button for both, and the API refused the second: the dead end of 2026-07-13. The
      // admin UI needs the round's own state to know which one it is looking at.
      // Independent queries, so they go together.
      const [assignments, round] = await Promise.all([
        prisma.assignment.findMany({
          where: { groupId, year },
          include: {
            giver: true,
            receiver: { include: { wishlistItems: { orderBy: { order: "asc" } } } },
          },
          orderBy: { giver: { name: "asc" } },
        }),
        getRound(groupId, year),
      ]);

      return NextResponse.json({ assignments, round });
    }

    // PARTICIPANT: only their OWN match, and only once the round is sent.
    // Middleware allows any logged-in group member to GET this route, so the
    // row-level filter here is what actually prevents one member from reading
    // the whole pairing table.
    // Guard personId explicitly: a findFirst with giverId undefined would drop
    // the filter and return an arbitrary member's pairing.
    if (!session.isLoggedIn || !session.personId || session.groupId !== groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const year = await getActiveYear(groupId);
    const mine = await prisma.assignment.findFirst({
      where: { groupId, year, giverId: session.personId },
      include: {
        receiver: { select: { name: true, wishlistItems: { orderBy: { order: "asc" } } } },
        round: true,
      },
    });
    if (!mine || mine.round?.status !== "sent") {
      return NextResponse.json({ assignment: null, ready: false });
    }
    return NextResponse.json({ assignment: mine, ready: true });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE all assignments for a group's active year (admin only). The year is
// always resolved server-side - a ?year= on this endpoint is ignored, unlike
// the GET admin history view.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const year = await getActiveYear(groupId);

    // This is the app's ONE deliberate "destroy the draw" action, and it is destructive
    // in exactly the way person-delete now refuses to be: on an already-SENT round it
    // wipes matches the family has opened and shopped for, and there is no undo and no
    // record of the old pairs. Person-delete's 409 sends the organiser here, so this
    // path had better be the safe one. Snapshot before wiping a draw that went out, and
    // FAIL CLOSED - the snapshot is the only rollback there is.
    const round = await getRound(groupId, year);

    // No round means no assignments (Assignment.roundId is a required FK), so there is
    // nothing to clear.
    if (!round) {
      return NextResponse.json({ success: true });
    }

    if (round.sentAt) {
      const snapshot = await snapshotOrRefuse("draw", "sent draw was NOT cleared");
      if (!snapshot.ok) return snapshot.refusal;
    }

    // Delete the assignments AND reset the round to draft in one transaction. Without the
    // reset, clearing a draw after a Send leaves the round in `sent`, which then refuses
    // regeneration - stranding the group.
    //
    // Scoped by roundId, never (groupId, year): `year` was read before the transaction, so
    // a concurrent rollover would move the group's year pointer and a year-scoped write
    // would then shred the WRONG round - the previous year's history, which is the only
    // thing that stops the draw repeating last year's pairs.
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { roundId: round.id } }),
      prisma.round.update({ where: { id: round.id }, data: RESET_TO_DRAFT }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
