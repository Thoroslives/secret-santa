import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Require that the current session is an admin who owns `groupId`.
 * Returns a 403 NextResponse to return from the handler, or null when allowed.
 * Middleware already gates the admin API routes; this is the in-route
 * defense-in-depth check that also enforces per-group ownership.
 */
export async function requireAdminForGroup(
  groupId: string
): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session.isAdmin || session.adminGroupId !== groupId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
