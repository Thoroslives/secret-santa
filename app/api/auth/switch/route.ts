import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getActiveDrawsForPerson } from "@/lib/draws";

export const dynamic = "force-dynamic";

// POST /api/auth/switch {personId} - switch the active draw for a participant
// whose email is in more than one group. The switchable set is derived LIVE from
// the authenticated person (session.personId -> their current email -> active
// same-email persons) and the requested personId is membership-checked against
// it. The client's word for "which draw" is never trusted, the set tracks the
// current email (no frozen-cookie pivot), and a person deactivated or re-emailed
// since login drops out. On success only the active session fields are
// re-pointed, so every group-scoped screen and API keeps reading the session
// exactly as before.
export async function POST(req: NextRequest) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.personId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let personId: unknown;
  try {
    ({ personId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!personId || typeof personId !== "string") {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  const draws = await getActiveDrawsForPerson(session.personId);
  const target = draws.find((d) => d.personId === personId);
  if (!target) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  session.personId = target.personId;
  session.personName = target.personName;
  session.groupId = target.groupId;
  session.groupName = target.groupName;
  await session.save();

  return NextResponse.json(target);
}
