import { getIronSession, IronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export interface SessionData {
  personId?: string;
  personName?: string;
  groupId?: string;
  groupName?: string;
  loginMethod?: "link";
  isLoggedIn?: boolean;
  // Admin session fields. Single super-admin over ALL groups (P4) - no more
  // per-group adminGroupId/adminGroupName/adminInviteCode.
  isAdmin?: boolean;
  adminEmail?: string;
  adminLoginMethod?: "oidc" | "breakglass";
  // Transient OIDC PKCE/state, set mid-flow and cleared once the callback
  // completes (B1/B2 - not used yet).
  oidcVerifier?: string;
  oidcState?: string;
}

export function cookieSecure(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.COOKIE_SECURE !== undefined
    ? env.COOKIE_SECURE === "true"
    : env.NODE_ENV === "production";
}

const sessionOptions = {
  password: process.env.SESSION_SECRET || "this-is-a-development-only-secret-that-must-be-changed",
  cookieName: "secret-santa-session",
  cookieOptions: {
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24, // 24 hours
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

export async function getSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions);
}
