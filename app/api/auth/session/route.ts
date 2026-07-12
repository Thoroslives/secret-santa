import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getActiveDrawsForPerson } from "@/lib/draws";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn && !session.isAdmin) {
      return NextResponse.json({ authenticated: false });
    }

    // The cookie outlives the row. A person (or their whole group) can be deleted
    // underneath a live 24h session, and this route used to keep answering
    // `authenticated: true` straight from the cookie - so the wishlist page never
    // redirected, every fetch behind it 404'd, and the participant sat looking at a
    // blank, error-free page instead of being logged out. Check the row still exists.
    //
    // Clear ONLY the participant half of the session. `isAdmin` and `isLoggedIn` share
    // one cookie, and the organiser is a participant in their own draw - so a
    // session.destroy() here would strip their admin rights the instant they deleted a
    // group containing themselves and bounce them out of the dashboard mid-operation.
    // It would also throw away an in-flight OIDC login (oidcState / oidcVerifier).
    if (session.isLoggedIn && session.personId) {
      const stillExists = await prisma.person.findUnique({
        where: { id: session.personId },
        select: { id: true },
      });
      if (!stillExists) {
        session.isLoggedIn = false;
        delete session.personId;
        delete session.personName;
        delete session.groupId;
        delete session.groupName;
        delete session.loginMethod;
        await session.save();

        return NextResponse.json({
          authenticated: !!session.isAdmin,
          isLoggedIn: false,
          isAdmin: !!session.isAdmin,
          adminEmail: session.adminEmail,
          adminLoginMethod: session.adminLoginMethod,
          draws: [],
        });
      }
    }

    // A participant's switchable draws (same email, other groups). Derived live
    // from the authenticated person; empty for admins / non-participants.
    const draws =
      session.isLoggedIn && session.personId
        ? await getActiveDrawsForPerson(session.personId)
        : [];

    return NextResponse.json({
      authenticated: true,
      personId: session.personId,
      personName: session.personName,
      groupId: session.groupId,
      groupName: session.groupName,
      loginMethod: session.loginMethod,
      isLoggedIn: session.isLoggedIn,
      isAdmin: session.isAdmin,
      adminEmail: session.adminEmail,
      adminLoginMethod: session.adminLoginMethod,
      draws,
    });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ authenticated: false });
  }
}
