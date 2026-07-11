import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET the participant-safe roster: {id, name} only, for active people in the
// caller's own group, excluding the caller. Used so a logged-in participant
// can pick who to suggest a gift for.
//
// The select is deliberately id+name ONLY - never personalLinkToken (a
// durable, unguessable bearer login credential, see app/p/[token]) and never
// email. That is exactly why GET /api/people is admin-only: a participant who
// harvested everyone's tokens could impersonate them. This route is the
// participant-safe alternative and must never widen its select.
export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const roster = await prisma.person.findMany({
      where: {
        groupId: session.groupId,
        active: true,
        id: { not: session.personId },
      },
      select: { id: true, name: true },
    });

    return NextResponse.json({ roster });
  } catch (error) {
    console.error("Error fetching roster:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
