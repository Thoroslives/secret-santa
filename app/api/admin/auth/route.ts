import { NextRequest, NextResponse } from "next/server";

// P4-A3: replaced next task. AdminConfig is gone (P4-A1); admin auth is being
// rebuilt around a single super-admin (env break-glass + OIDC). Short-circuited
// here so the build stays green until that lands.
export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: "admin auth reconfiguring" }, { status: 503 });
}
