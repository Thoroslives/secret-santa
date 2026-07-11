import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET all assignments for a group and year
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // ADMIN: sees every pair for the round (this is the review view).
    if (session.isAdmin) {
      if (session.adminGroupId !== groupId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const assignments = await prisma.assignment.findMany({
        where: { groupId, year },
        include: {
          giver: true,
          receiver: { include: { wishlistItems: { orderBy: { order: "asc" } } } },
          round: true,
        },
        orderBy: { giver: { name: "asc" } },
      });
      return NextResponse.json({ assignments });
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
    const mine = await prisma.assignment.findFirst({
      where: { groupId, year, giverId: session.personId },
      include: {
        receiver: { include: { wishlistItems: { orderBy: { order: "asc" } } } },
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

// DELETE all assignments for a group and year (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");
    const year = parseInt(searchParams.get("year") || "") || new Date().getFullYear();

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Verify admin owns this group
    if (session.adminGroupId !== groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete the assignments AND reset the round to draft in one transaction.
    // Without the reset, deleting after a Send leaves the round in `sent`, which
    // then refuses regeneration - stranding the group. updateMany is a no-op if
    // no round exists for this group/year yet.
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { groupId, year } }),
      prisma.round.updateMany({
        where: { groupId, year },
        data: { status: "draft", sentAt: null },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignments:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
