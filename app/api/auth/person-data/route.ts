import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const person = await prisma.person.findUnique({
      where: { id: session.personId },
      include: {
        wishlistItems: {
          orderBy: { order: "asc" },
        },
        giverFor: {
          include: {
            receiver: {
              include: {
                wishlistItems: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          where: {
            groupId: session.groupId,
            year: new Date().getFullYear(),
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    return NextResponse.json({
      wishlistItems: person.wishlistItems,
      assignment: person.giverFor[0] || null,
    });
  } catch (error) {
    console.error("Person data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
