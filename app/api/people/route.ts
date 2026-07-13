import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generatePersonalLinkToken, isValidEmail, normalizeEmail } from "@/lib/utils";
import { getSession } from "@/lib/session";
import { findEmailHolders, linkAcknowledged } from "@/lib/people";
import { getActiveYear } from "@/lib/rounds";
import { getVisitSummaries, type VisitSummary } from "@/lib/visits";

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

    // No people, no visits to summarise - and an empty roster is ALSO what a deleted group
    // looks like, because deleting one cascades its people away. That is what keeps this
    // route a 200 for a stale groupId (a second admin tab still holding a draw the Danger
    // zone just deleted) WITHOUT swallowing errors to get there.
    //
    // It is deliberately NOT `getActiveYear(groupId).catch(() => null)`. getActiveYear throws
    // for the modelled "group not found" case, but it also throws for any database error -
    // SQLITE_BUSY above all, which is likeliest exactly when the admin is watching this page
    // (they hit Send, the family opens their email at once, and the writer lock contends).
    // Catching everything would set year = null, produce zero summaries, and render a
    // confident "Never opened their link" AGAINST THE ENTIRE FAMILY, silently. lib/visits.ts
    // takes pains to avoid exactly that lie on the write path; the read path must not
    // reintroduce it. A real database error belongs in the 500 handler below, where it is
    // logged and visible.
    //
    // Year-scoped, because rollover wipes wishlists and suggestions. A lifetime total would
    // quietly fold last Christmas into this one's picture.
    const summaries = people.length
      ? await getVisitSummaries(
          people.map((person) => person.id),
          await getActiveYear(groupId)
        )
      : new Map<string, VisitSummary>();

    // Zero and null, never undefined. Someone who has never opened their link is the single
    // most important row on this dashboard, so absence must serialise as a real 0.
    const withVisits = people.map((person) => {
      const summary = summaries.get(person.id);
      return {
        ...person,
        visitCount: summary?.visitCount ?? 0,
        lastVisitAt: summary?.lastVisitAt ?? null,
        recentVisits: summary?.recentVisits ?? 0,
      };
    });

    return NextResponse.json({ people: withVisits });
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
