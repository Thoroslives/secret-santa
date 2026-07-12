import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { snapshotOrRefuse } from "@/lib/db-snapshot";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const groupId = params.id;

    // Verify user has access to this group. Super-admin owns every group (so
    // this is always satisfied for an admin); a participant only their own.
    const userGroupId = session.isAdmin ? groupId : session.groupId;
    if (userGroupId !== groupId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        _count: {
          select: {
            people: true,
            assignments: true,
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error("Error fetching group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    const groupId = params.id;

    // Only the super-admin can modify groups (owns every group).
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { budgetAmount, budgetCurrency, suggestionCap, previousYearMemory, organiserName, personalMessage } = await request.json();

    // Validate currency if provided
    const validCurrencies = [
      'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'ZAR', 'JPY', 'CHF',
      'SEK', 'NOK', 'DKK', 'NZD', 'MXN', 'BRL', 'INR', 'CNY',
      'KRW', 'SGD'
    ];

    if (budgetCurrency && !validCurrencies.includes(budgetCurrency)) {
      return NextResponse.json(
        { error: "Invalid currency code" },
        { status: 400 }
      );
    }

    if (budgetAmount !== undefined && budgetAmount !== null && (isNaN(budgetAmount) || budgetAmount < 0)) {
      return NextResponse.json(
        { error: "Budget amount must be a positive number" },
        { status: 400 }
      );
    }

    // suggestionCap / previousYearMemory: both are P3 knobs, each an integer
    // 0..10 inclusive. Validated only when present in the body; omitted means
    // "leave as-is" (guarded below, not written to the update data at all).
    const isValidCapValue = (value: unknown): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10;

    if (suggestionCap !== undefined && !isValidCapValue(suggestionCap)) {
      return NextResponse.json(
        { error: "suggestionCap must be an integer between 0 and 10" },
        { status: 400 }
      );
    }

    if (previousYearMemory !== undefined && !isValidCapValue(previousYearMemory)) {
      return NextResponse.json(
        { error: "previousYearMemory must be an integer between 0 and 10" },
        { status: 400 }
      );
    }

    // Optional per-group email personalisation. Bounded so a runaway paste can't
    // bloat a group row or the emails built from it.
    if (organiserName !== undefined && organiserName !== null && String(organiserName).length > 100) {
      return NextResponse.json(
        { error: "organiserName must be 100 characters or fewer" },
        { status: 400 }
      );
    }
    if (personalMessage !== undefined && personalMessage !== null && String(personalMessage).length > 2000) {
      return NextResponse.json(
        { error: "personalMessage must be 2000 characters or fewer" },
        { status: 400 }
      );
    }

    const data: {
      budgetAmount?: number | null;
      budgetCurrency?: string;
      updatedAt: Date;
      suggestionCap?: number;
      previousYearMemory?: number;
      organiserName?: string | null;
      personalMessage?: string | null;
    } = {
      updatedAt: new Date(),
    };

    // Guard-and-merge: only include a key when the caller actually sent it, so
    // an omitted field is never overwritten. This makes a partial PATCH (e.g.
    // saving only the organiser note, or only the suggestion cap) safe - it no
    // longer resets budgetCurrency to USD.
    if (budgetAmount !== undefined) {
      data.budgetAmount = budgetAmount;
    }
    if (budgetCurrency !== undefined) {
      data.budgetCurrency = budgetCurrency;
    }
    if (suggestionCap !== undefined) {
      data.suggestionCap = suggestionCap;
    }
    if (previousYearMemory !== undefined) {
      data.previousYearMemory = previousYearMemory;
    }
    // Trim, and store an emptied field as null (not "") so it cleanly drops out
    // of the emails. Omitted (undefined) means "leave as-is" per the guard.
    if (organiserName !== undefined) {
      data.organiserName = String(organiserName).trim() || null;
    }
    if (personalMessage !== undefined) {
      data.personalMessage = String(personalMessage).trim() || null;
    }

    const group = await prisma.group.update({
      where: { id: groupId },
      data,
    });

    return NextResponse.json({ group });
  } catch (error) {
    console.error("Error updating group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE a group, and everything in it.
//
// The single most destructive endpoint in the app: one `group.delete()` cascades away
// every person, wishlist, round, assignment, block, forced pin and suggestion in that
// group. Verified against a copy of the live database (zero orphans across all seven
// tables) because the test suite mocks Prisma and so cannot watch a real cascade fire.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    // Admin only, and deliberately NOT the `session.isAdmin ? groupId : session.groupId`
    // idiom the GET above uses. That one intentionally admits a participant to their own
    // group - reusing it here would let any family member delete the family's draw.
    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const groupId = params.id;

    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Snapshot first, and fail closed. (There is no deploy where this legitimately fails
    // but the delete should still proceed: SQLite must be able to write to that same
    // directory, or the app could not be serving this request at all.)
    const snapshot = await snapshotOrRefuse("group", "group was NOT deleted");
    if (!snapshot.ok) return snapshot.refusal;

    await prisma.group.delete({ where: { id: groupId } });

    // The path goes to the log, not to the browser: it is where an operator looks for the
    // rescue copy, and it has no business in a response body.
    console.log(`Deleted group ${groupId} ("${group.name}"). Snapshot: ${snapshot.path}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
