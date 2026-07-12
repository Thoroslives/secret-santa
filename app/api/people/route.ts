import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePersonalLinkToken, isValidEmail, normalizeEmail } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { findEmailHolders, linkAcknowledged } from "@/lib/people";

// GET all people for a group
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId");

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    // Admin-only: the response includes each person's durable
    // `personalLinkToken`, which is a login credential (see app/p/[token]).
    // A participant enumerating the roster would harvest everyone's tokens and
    // could impersonate them, so only the (super-)admin may list people.
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const people = await prisma.person.findMany({
      where: { groupId },
      include: {
        wishlistItems: {
          orderBy: { order: "asc" },
        },
        _count: {
          select: { wishlistItems: true, suggestionsBy: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ people });
  } catch (error) {
    console.error("Error fetching people:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST create a new person in a group (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { name, email, groupId, acknowledgedLinkIds } = await request.json();

    if (!name || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const normalized = normalizeEmail(email);

    if (normalized) {
      if (!isValidEmail(normalized)) {
        return NextResponse.json(
          { error: "Please enter a valid email address" },
          { status: 400 }
        );
      }

      // One query answers both questions below.
      const holders = await findEmailHolders(normalized, []);

      // Already taken inside this group: @@unique([groupId, email]) would refuse the
      // write anyway. Answered first, so the confirmation below never offers to "link"
      // something that cannot be written.
      if (holders.some((h) => h.groupId === groupId)) {
        return NextResponse.json({ error: "Email is already used in this group" }, { status: 400 });
      }

      // Everyone left holds the address in ANOTHER group, so creating this person
      // MERGES the two: sharing an address makes them switchable siblings
      // (lib/draws.ts), and each can then open the other's draw and see their match.
      // That is exactly how one human gets their several draws under a single login,
      // and it is the worst bug in the app when they are different humans. So it is
      // confirmed, never silent, and the admin is shown WHO by name: in the genuine
      // case the names match, in the typo case they plainly do not.
      if (!linkAcknowledged(holders, acknowledgedLinkIds)) {
        return NextResponse.json(
          // The SERVER's canonical form of the address, so the dialog shows exactly
          // what is about to be written rather than the client's guess at it.
          { needsConfirmation: true, email: normalized, linksTo: holders },
          { status: 409 }
        );
      }
    }

    const person = await prisma.person.create({
      data: {
        name: name.trim(),
        email: normalized,
        personalLinkToken: generatePersonalLinkToken(),
        groupId,
      },
    });

    return NextResponse.json({ person }, { status: 201 });
  } catch (error) {
    console.error("Error creating person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
