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
              select: {
                name: true,
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

    // The santa's-eye view: once the match is revealed, the giver may also
    // see the gift suggestions OTHERS left about their receiver. This is the
    // one place a suggestion crosses to another person, so the query filters
    // on assignment.receiverId (the person the caller is gifting) - NEVER on
    // session.personId (the caller). That keeps the subject of a suggestion
    // from ever seeing it via their own person-data. Anonymous suggesters
    // (named:false) are never identified.
    const matchSuggestions = assignment
      ? (
          await prisma.suggestion.findMany({
            where: { roundId: assignment.roundId, forPersonId: assignment.receiverId },
            include: { byPerson: { select: { name: true } } },
          })
        ).map((s) => ({
          id: s.id,
          name: s.name,
          note: s.note,
          from: s.named ? s.byPerson.name : "Anonymous",
        }))
      : [];

    return NextResponse.json({
      wishlistItems: person.wishlistItems,
      assignment,
      matchSuggestions,
    });
  } catch (error) {
    console.error("Person data error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
