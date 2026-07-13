import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getActiveYear, getRound } from "@/lib/rounds";

// Blocks are symmetric and persist across years (partners never draw each other).
// Stored once with the pair id-sorted so (A,B) and (B,A) dedupe. Admin-only on
// every verb, GET included: blocks shape the draw, so they stay off participant
// routes even though a block alone does not reveal a match.

// GET /api/blocks?groupId=<id> - the group's blocks. Admin only.
export async function GET(request: NextRequest) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const groupId = new URL(request.url).searchParams.get("groupId");
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Raw ids. The dashboard already holds the people it needs to name them - the
    // person <select>s cannot render without that list - so resolving names here
    // would just be a second copy of it.
    const blocks = await prisma.block.findMany({
      where: { groupId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error("List blocks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/blocks {groupId, personAId, personBId}
export async function POST(request: NextRequest) {
  try {
    const { groupId, personAId, personBId } = await request.json();

    if (!groupId || !personAId || !personBId) {
      return NextResponse.json(
        { error: "groupId, personAId and personBId are required" },
        { status: 400 }
      );
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    if (personAId === personBId) {
      return NextResponse.json(
        { error: "A person cannot be blocked from themselves" },
        { status: 400 }
      );
    }

    // Both must belong to this group - but note we deliberately do NOT require `active`
    // here, where pins do. A block is a permanent, cross-year fact ("these two are a
    // couple"); someone deactivated for one year may be back the next, and their block
    // must survive that. An inactive person simply never enters generate()'s candidate
    // set, so a block naming them is harmless until they return. A PIN is the opposite:
    // it is per-round and can never be satisfied by an inactive person, so pins check
    // `active` and blocks must not.
    const members = await prisma.person.findMany({
      where: { groupId },
      select: { id: true },
    });
    const memberIds = new Set(members.map((p) => p.id));
    if (!memberIds.has(personAId) || !memberIds.has(personBId)) {
      return NextResponse.json(
        { error: "Both people must belong to this group" },
        { status: 400 }
      );
    }

    // A draw already exists and this block contradicts it (it pairs these two, in either
    // direction - blocks are symmetric). Refuse; never destroy. See the long note in
    // app/api/pins/route.ts for why this refuses instead of clearing the draw.
    //
    // A SENT round is deliberately exempt: a sent draw is history, and Boss's rule is
    // that blocks stay editable afterwards and simply apply from the next draw. So we
    // only guard the `generated` (reviewable, not yet emailed) state.
    // Normalise pair order so the block is symmetric and dedupable.
    const [a, b] = [personAId, personBId].sort();

    // Dedupe BEFORE the stale-draw guard, not after. Re-posting a block that already
    // exists changes nothing, so it cannot invalidate a draw - and the guard only exists
    // to catch changes that can. Checked the other way round, an idempotent no-op re-add
    // would get a 409 purely because a draw generated BEFORE the block still pairs those
    // two, which contradicts the guard's own rule.
    const existing = await prisma.block.findFirst({
      where: { groupId, personAId: a, personBId: b },
    });
    if (existing) return NextResponse.json({ block: existing });

    const year = await getActiveYear(groupId);
    const round = await getRound(groupId, year);
    if (round?.status === "generated") {
      const assignments = await prisma.assignment.findMany({
        where: { roundId: round.id },
        select: { giverId: true, receiverId: true },
      });
      const pairs = assignments.some(
        (x) =>
          (x.giverId === personAId && x.receiverId === personBId) ||
          (x.giverId === personBId && x.receiverId === personAId)
      );
      if (pairs) {
        return NextResponse.json(
          {
            error:
              "The current draw pairs these two. Clear the draw and generate again to apply this block.",
          },
          { status: 409 }
        );
      }
    }

    const block = await prisma.block.create({
      data: { groupId, personAId: a, personBId: b },
    });
    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    console.error("Create block error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/blocks?id=<blockId>
export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Block id is required" }, { status: 400 });
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const block = await prisma.block.findUnique({ where: { id } });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    await prisma.block.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete block error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
