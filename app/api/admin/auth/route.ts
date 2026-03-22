import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";
import { adminAuthRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = adminAuthRateLimit(request);
    if (!rateLimitResult.success) return rateLimitResult.response!;

    const { password, groupId } = await request.json();

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Get admin config for this group
    const adminConfig = await prisma.adminConfig.findUnique({
      where: { groupId },
      include: { group: true },
    });

    if (!adminConfig) {
      // Use same error message to prevent enumeration
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, adminConfig.hashedPassword);

    if (!isValid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Set server-side admin session
    const session = await getSession();
    session.isAdmin = true;
    session.adminGroupId = adminConfig.group.id;
    session.adminGroupName = adminConfig.group.name;
    session.adminInviteCode = adminConfig.group.inviteCode;
    await session.save();

    return NextResponse.json({
      success: true,
      group: {
        id: adminConfig.group.id,
        name: adminConfig.group.name,
        inviteCode: adminConfig.group.inviteCode,
        year: adminConfig.group.year,
      },
    });
  } catch (error) {
    console.error("Admin auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
