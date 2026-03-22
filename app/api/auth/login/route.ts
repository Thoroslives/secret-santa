import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { authRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = authRateLimit(request);
    if (!rateLimitResult.success) return rateLimitResult.response!;

    const { loginCode, groupId } = await request.json();

    if (!loginCode) {
      return NextResponse.json({ error: "Login code is required" }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Find person by login code in this group
    const person = await prisma.person.findFirst({
      where: {
        loginCode: loginCode.toUpperCase(),
        groupId,
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            year: true,
          },
        },
        wishlistItems: {
          orderBy: { order: "asc" },
        },
        giverFor: {
          include: {
            receiver: {
              include: {
                wishlistItems: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          where: {
            groupId,
            year: new Date().getFullYear(),
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: "Invalid login code for this group" }, { status: 401 });
    }

    // Set server-side session
    const session = await getSession();
    session.personId = person.id;
    session.personName = person.name;
    session.groupId = person.group.id;
    session.groupName = person.group.name;
    session.loginMethod = "code";
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
        loginCode: person.loginCode,
        group: person.group,
        wishlistItems: person.wishlistItems,
        assignment: person.giverFor[0] || null,
      },
    });
  } catch (error) {
    console.error("User login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
