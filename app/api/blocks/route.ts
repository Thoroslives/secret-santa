import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// Blocks are symmetric and persist across years (partners never draw each
// other). Stored once with the pair id-sorted so (A,B) and (B,A) dedupe.
// GET is not exposed - the admin dashboard reads blocks via the group fetch.

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

    // Normalise pair order so the block is symmetric and dedupable.
    const [a, b] = [personAId, personBId].sort();

    const existing = await prisma.block.findFirst({
      where: { groupId, personAId: a, personBId: b },
    });
    if (existing) return NextResponse.json({ block: existing });

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

    const block = await prisma.block.findUnique({ where: { id } });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    await prisma.block.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete block error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
