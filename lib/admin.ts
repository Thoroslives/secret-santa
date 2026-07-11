import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Require that the current session is the (single, super-) admin.
 * Returns a 403 NextResponse to return from the handler, or null when allowed.
 * Middleware already gates the admin API routes; this is the in-route
 * defense-in-depth check. There is no per-group ownership anymore - a
 * successful admin session owns every group.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
