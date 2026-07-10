import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// PATCH a person's active flag (admin only) - used to enable/disable a person's
// durable personal link without deleting their history (wishlist, assignments).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { id } = params;
    const { active } = await request.json();

    if (typeof active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
    }

    // Verify the person belongs to the admin's group
    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (person.groupId !== session.adminGroupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.person.update({
      where: { id },
      data: { active },
    });

    return NextResponse.json({ person: updated });
  } catch (error) {
    console.error("Error updating person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE a person (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { id } = params;

    // Verify the person belongs to the admin's group
    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (person.groupId !== session.adminGroupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.person.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
