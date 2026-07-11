import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminForGroup } from "@/lib/admin";
import { ensureRound, getActiveYear } from "@/lib/rounds";

// Forced pins are directional (this giver MUST draw that receiver) and scoped
// to one round (year). GET is not exposed - the dashboard reads pins via the
// round/group fetch.

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

    const forbidden = await requireAdminForGroup(groupId);
    if (forbidden) return forbidden;

    if (giverId === receiverId) {
      return NextResponse.json(
        { error: "A person cannot be pinned to themselves" },
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

    // One forced target per giver per round (@@unique([roundId, giverId])).
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

    const pin = await prisma.forcedPin.findUnique({
      where: { id },
      include: { round: true },
    });
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }

    const forbidden = await requireAdminForGroup(pin.round.groupId);
    if (forbidden) return forbidden;

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
