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
  "/api/groups/", // PATCH operations on groups
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

  // Check admin API routes (require admin session)
  for (const route of adminApiRoutes) {
    if (pathname.startsWith(route)) {
      // Allow GET for people and assignments if user is logged in (participant or admin)
      if (method === "GET" && (session.isLoggedIn || session.isAdmin)) {
        return response;
      }
      // Write operations require admin
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

  // Check group write operations (PATCH)
  for (const route of adminWriteRoutes) {
    if (pathname.startsWith(route) && method === "PATCH") {
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
