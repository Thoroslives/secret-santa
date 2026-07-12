import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveDrawsForPerson } from "@/lib/draws";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn && !session.isAdmin) {
      return NextResponse.json({ authenticated: false });
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
