import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMagicToken } from "@/lib/email";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Invalid or missing token" },
        { status: 400 }
      );
    }

    // Verify the magic token
    const tokenData = verifyMagicToken(token);

    if (!tokenData) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 400 }
      );
    }

    // Verify person still exists and email matches
    const person = await prisma.person.findUnique({
      where: { id: tokenData.personId },
      include: {
        group: true,
      },
    });

    if (!person || person.email !== tokenData.email || person.groupId !== tokenData.groupId) {
      return NextResponse.json(
        { error: "Invalid token data" },
        { status: 400 }
      );
    }

    // Set server-side session
    const session = await getSession();
    session.personId = person.id;
    session.personName = person.name;
    session.groupId = person.groupId;
    session.groupName = person.group.name;
    session.loginMethod = "magic-link";
    session.isLoggedIn = true;
    await session.save();

    // Return success with session data
    return NextResponse.json({
      success: true,
      person: {
        id: person.id,
        name: person.name,
        groupId: person.groupId,
        groupName: person.group.name,
      },
    });
  } catch (error) {
    console.error("Magic link verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
