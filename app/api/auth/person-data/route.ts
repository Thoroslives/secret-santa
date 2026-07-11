import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getActiveYear } from "@/lib/rounds";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const year = await getActiveYear(session.groupId);

    const person = await prisma.person.findUnique({
      where: { id: session.personId },
      include: {
        wishlistItems: {
          orderBy: { order: "asc" },
        },
        giverFor: {
          include: {
            round: true,
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
            year,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Only reveal the match once the round has been sent (blind before send).
    const mine = person.giverFor[0];
    const assignment = mine && mine.round?.status === "sent" ? mine : null;

    return NextResponse.json({
      wishlistItems: person.wishlistItems,
      assignment,
    });
  } catch (error) {
    console.error("Person data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
