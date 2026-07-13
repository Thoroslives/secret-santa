import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { SessionData, cookieSecure } from "@/lib/session";

const sessionOptions = {
  password: process.env.SESSION_SECRET || "this-is-a-development-only-secret-that-must-be-changed",
  cookieName: "secret-santa-session",
  cookieOptions: {
    secure: cookieSecure(),
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

// Routes that require participant authentication
const participantApiRoutes = [
  "/api/auth/person-data",
  "/api/wishlist",
  "/api/roster",
  "/api/suggestions",
];

// Routes that require admin authentication
const adminApiRoutes = [
  "/api/people",
  "/api/assignments",
  "/api/blocks",
  "/api/pins",
  "/api/rounds",
];

// Routes that require admin for write operations
const adminWriteRoutes = [
  "/api/groups/", // PATCH and DELETE operations on groups
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Skip auth for public routes and auth endpoints
  if (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/admin/auth") ||
    pathname.startsWith("/api/admin/oidc/login") ||
    pathname.startsWith("/api/admin/oidc/callback")
  ) {
    return NextResponse.next();
  }

  // Get session
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  // Check participant API routes
  for (const route of participantApiRoutes) {
    if (pathname.startsWith(route)) {
      if (!session.isLoggedIn) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      return response;
    }
  }

  // Check admin API routes - admin only, on EVERY method including GET.
  //
  // There used to be a blanket GET exemption here ("allow GET if the user is logged
  // in") whose comment claimed it was for "people and assignments". It was not: it
  // applied to every route in the list above, so a logged-in PARTICIPANT passed
  // straight through on GET /api/pins - and a ForcedPin row says "A draws B", which
  // IS the draw. Nothing leaked only because each handler happened to self-defend
  // with requireAdmin(); the perimeter itself was open, and the next GET added here
  // by anyone who trusted this middleware would have leaked by default.
  //
  // Deleting it is safe: no participant-facing page fetches any of these five routes
  // (participants read their own match via /api/auth/person-data, and their group via
  // the exact-matched GET /api/groups/[id] below). __tests__/middleware.test.ts is the
  // guard - it fails against the old exemption.
  for (const route of adminApiRoutes) {
    if (pathname.startsWith(route)) {
      if (!session.isAdmin) {
        return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
      }
      return response;
    }
  }

  // Group creation and the admin group list are admin-only (no public
  // sign-up - P4-A4). Matched exactly, NOT as a prefix, so GET /api/groups/[id]
  // (a participant reading their own group) stays open to participants.
  if (
    (pathname.startsWith("/api/groups/create") && method === "POST") ||
    (pathname === "/api/groups" && method === "GET")
  ) {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }
    return response;
  }

  // Check group write operations (PATCH, DELETE).
  //
  // DELETE matters most: it cascades an entire group away (people, wishlists, rounds,
  // assignments, the lot). Without it here, DELETE /api/groups/[id] fell through every
  // branch of this middleware to the bare `return response` below, leaving the in-route
  // isAdmin check as its ONLY gate - the single most destructive endpoint in the app
  // would have been the one admin write that was not double-gated. Note the exact-match
  // block above deliberately keeps GET /api/groups/[id] open to participants; that must
  // never be allowed to extend to DELETE.
  for (const route of adminWriteRoutes) {
    if (pathname.startsWith(route) && (method === "PATCH" || method === "DELETE")) {
      if (!session.isAdmin) {
        return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
      }
      return response;
    }
  }

  // DELETE on /api/people/[id] requires admin
  if (pathname.match(/^\/api\/people\//) && method === "DELETE") {
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
