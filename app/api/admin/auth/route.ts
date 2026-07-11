import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyBreakGlass } from "@/lib/adminAuth";
import { adminAuthRateLimit } from "@/lib/rate-limit";

// POST /api/admin/auth {password} - break-glass super-admin login. No groupId:
// a successful admin session owns every group. Always answers the same
// generic 401 on any failure (missing/wrong password, break-glass not
// configured) so the response never reveals which one it was. OIDC admin
// login (B1/B2) will be a separate route.
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = adminAuthRateLimit(request);
    if (!rateLimitResult.success) return rateLimitResult.response!;

    const { password } = await request.json();

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    if (!verifyBreakGlass(password)) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const session = await getSession();
    session.isAdmin = true;
    session.adminEmail = undefined;
    session.adminLoginMethod = "breakglass";
    await session.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
