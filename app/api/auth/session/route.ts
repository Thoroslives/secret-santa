import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();

    if (!session.isLoggedIn && !session.isAdmin) {
      return NextResponse.json({ authenticated: false });
    }

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
    });
  } catch (error) {
    console.error("Session check error:", error);
    return NextResponse.json({ authenticated: false });
  }
}
