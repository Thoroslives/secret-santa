import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { ensureRound, getActiveYear, getRound } from "@/lib/rounds";

// Forced pins are directional (this giver MUST draw that receiver) and scoped to
// one round (year). Every verb here is admin-only, GET included: a ForcedPin row
// says "A draws B", so it IS the draw. It must never reach a participant.

// GET /api/pins?groupId=<id> - the ACTIVE round's pins. Admin only.
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const groupId = new URL(request.url).searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Year resolved server-side, exactly as POST does - never from the query string.
    // getRound, NOT ensureRound: a read must never materialize a Round row, or merely
    // opening the dashboard for a group with no draw yet would create an empty one.
    const year = await getActiveYear(groupId);
    const round = await getRound(groupId, year);
    if (!round) {
      return NextResponse.json({ pins: [], year });
    }

    // Scoped by roundId. ForcedPin carries no groupId, so a query that traversed
    // group->round without pinning the year would hand back every past year's pins.
    // roundId is unique per (groupId, year), so this cannot.
    const pins = await prisma.forcedPin.findMany({
      where: { roundId: round.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ pins, year });
  } catch (error) {
    console.error("List pins error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/pins {groupId, giverId, receiverId} - year is resolved server-side
// (active year), never client-supplied.
export async function POST(request: NextRequest) {
  try {
    const { groupId, giverId, receiverId } = await request.json();

    if (!groupId || !giverId || !receiverId) {
      return NextResponse.json(
        { error: "groupId, giverId and receiverId are required" },
        { status: 400 }
      );
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    if (giverId === receiverId) {
      return NextResponse.json(
        { error: "A person cannot be pinned to themselves" },
        { status: 400 }
      );
    }

    // Both ends must be ACTIVE members of this group. `active` is not incidental:
    // generate() builds its candidate set from { groupId, active: true }, so a pin at a
    // deactivated person can never be satisfied - the engine rejects it with a raw cuid
    // ("Invalid pin: receiver <cuid> is not in the group"), and only at generate time,
    // long after the mistake. The picker will happily offer a deactivated person, because
    // GET /api/people does not filter them out. Catch it here, by name, at the point of
    // entry. (/api/rounds/seed has always done this; pins never did.)
    const members = await prisma.person.findMany({
      where: { groupId, active: true },
      select: { id: true },
    });
    const activeIds = new Set(members.map((p) => p.id));
    if (!activeIds.has(giverId) || !activeIds.has(receiverId)) {
      // Name whoever is at fault. The picker is fed from GET /api/people, which does not
      // filter inactive people out, so the admin can pick someone perfectly real-looking;
      // "one of these two is invalid" would send them hunting. Fall back to the id only
      // if the person does not exist at all.
      const offenders = await prisma.person.findMany({
        where: { id: { in: [giverId, receiverId].filter((id) => !activeIds.has(id)) } },
        select: { id: true, name: true },
      });
      const named = offenders.map((p) => p.name).join(" and ");
      return NextResponse.json(
        {
          error: named
            ? `${named} is not an active member of this draw, so nobody can be pinned to them.`
            : "Both people must be active members of this group",
        },
        { status: 400 }
      );
    }

    const year = await getActiveYear(groupId);
    const round = await ensureRound(groupId, year);
    if (round.status === "sent") {
      return NextResponse.json(
        { error: "This round has already been sent; pins are locked" },
        { status: 400 }
      );
    }

    // A draw already exists and this pin contradicts it. Refuse, and say what it
    // conflicts with.
    //
    // Without this, the pin saved fine, the existing assignments carried on ignoring it,
    // and send() has no constraints-changed check - so the draw that went out to real
    // people silently disregarded the constraint the admin had just set.
    //
    // REFUSE, do not clear. Clearing is destructive, and the app already has exactly one
    // hardened way to do it (DELETE /api/assignments -> snapshots the DB via
    // snapshotOrRefuse and fails closed). A second destructive path here would have to
    // re-derive that snapshot logic, and would get it wrong on the round `send?revert=1`
    // leaves behind: status "generated" with sentAt wiped, i.e. an already-emailed draw
    // that looks unsent. Point the admin at the button that does it properly instead.
    if (round.status === "generated") {
      const assignments = await prisma.assignment.findMany({
        where: { roundId: round.id },
        select: { giverId: true, receiverId: true },
      });
      const current = assignments.find((a) => a.giverId === giverId);
      // No assignment for this giver (e.g. a stranded round with no rows) contradicts
      // nothing. Neither does a draw that already happens to satisfy the pin.
      if (current && current.receiverId !== receiverId) {
        return NextResponse.json(
          {
            error:
              "The current draw doesn't match this pin. Clear the draw and generate again to apply it.",
          },
          { status: 409 }
        );
      }
    }

    // One forced target per giver per round (@@unique([roundId, giverId])). Note this is
    // an upsert, so a POST is just as often a RETARGET of an existing pin as a new one -
    // which is exactly why the conflict test above is against the DRAW, not against
    // whether a pin row already exists.
    const pin = await prisma.forcedPin.upsert({
      where: { roundId_giverId: { roundId: round.id, giverId } },
      update: { receiverId },
      create: { roundId: round.id, giverId, receiverId },
    });
    return NextResponse.json({ pin }, { status: 201 });
  } catch (error) {
    console.error("Create pin error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/pins?id=<pinId>
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Pin id is required" }, { status: 400 });
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const pin = await prisma.forcedPin.findUnique({
      where: { id },
      include: { round: true },
    });
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }

    if (pin.round.status === "sent") {
      return NextResponse.json(
        { error: "This round has already been sent; pins are locked" },
        { status: 400 }
      );
    }

    await prisma.forcedPin.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete pin error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
