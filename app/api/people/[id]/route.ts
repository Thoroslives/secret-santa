import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generatePersonalLinkToken } from "@/lib/utils";

// PATCH a person (admin only). Two admin actions, either or both per call:
//   { active: boolean }   - enable/disable their durable link without losing
//                           history (wishlist, assignments).
//   { rotateLink: true }  - reissue a fresh personalLinkToken, invalidating the
//                           old /p/<token> link (use if a link leaks).
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
    const { active, rotateLink } = await request.json();

    if (typeof active !== "boolean" && rotateLink !== true) {
      return NextResponse.json(
        { error: "Provide `active` (boolean) and/or `rotateLink: true`" },
        { status: 400 }
      );
    }

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const data: { active?: boolean; personalLinkToken?: string } = {};
    if (typeof active === "boolean") data.active = active;
    if (rotateLink === true) data.personalLinkToken = generatePersonalLinkToken();

    const updated = await prisma.person.update({ where: { id }, data });

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

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
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
