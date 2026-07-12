import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { validateSuggestionInput } from "@/lib/suggestions";
import { ensureRound, getActiveYear } from "@/lib/rounds";

export const dynamic = "force-dynamic";

// Gift suggestions: a participant leaves gift ideas for someone ELSE in
// their group, capped per (byPerson, forPerson) pair. This route only ever
// creates a suggestion for the caller, lists the caller's own suggestions,
// and deletes the caller's own suggestions. The santa's-eye view (a giver
// reading their matched receiver's suggestions once the round is sent) is a
// separate, more restricted read path built elsewhere - it is NOT exposed
// here, so this file never needs to reason about round.status.
//
// Security invariant: `byPersonId` is ALWAYS `session.personId`. It is never
// read from the request body - accepting a client-supplied byPersonId would
// let anyone plant a suggestion "from" someone else. GET only ever filters
// suggestions by the caller's own personId, and DELETE checks ownership
// before removing anything. No path here may return or touch a suggestion
// whose `byPersonId` is anyone but the caller.

// POST /api/suggestions {forPersonId, name, note?, named?}
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { forPersonId, name, note, named } = await request.json();

    const validation = validateSuggestionInput({ forPersonId, name, note, named }, session.personId);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // forPerson must be an active member of the CALLER'S OWN group - blocks
    // both cross-group targeting and suggesting for a deactivated person.
    const forPerson = await prisma.person.findFirst({
      where: { id: forPersonId, groupId: session.groupId, active: true },
    });
    if (!forPerson) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const year = await getActiveYear(session.groupId);
    const round = await ensureRound(session.groupId, year);

    // Cap is per (byPerson, forPerson) pair for this round - how many gift
    // ideas one suggester may leave for one recipient.
    const count = await prisma.suggestion.count({
      where: { roundId: round.id, byPersonId: session.personId, forPersonId },
    });
    const group = await prisma.group.findUnique({
      where: { id: session.groupId },
      select: { suggestionCap: true },
    });
    const cap = group?.suggestionCap ?? 3;
    if (count >= cap) {
      return NextResponse.json(
        { error: `You can add at most ${cap} suggestions for one person.` },
        { status: 400 }
      );
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        roundId: round.id,
        forPersonId,
        byPersonId: session.personId,
        name: name.trim(),
        note: note?.trim() || null,
        named: !!named,
      },
    });

    return NextResponse.json(
      {
        suggestion: {
          id: suggestion.id,
          forPersonId: suggestion.forPersonId,
          name: suggestion.name,
          note: suggestion.note,
          named: suggestion.named,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create suggestion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/suggestions?mine=1 - only the caller's own suggestions, for the
// active round. Never returns another person's suggestions.
export async function GET(_request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const year = await getActiveYear(session.groupId);
    const round = await ensureRound(session.groupId, year);

    const suggestions = await prisma.suggestion.findMany({
      where: { byPersonId: session.personId, roundId: round.id },
      include: { forPerson: { select: { name: true } } },
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/suggestions?id=<suggestionId> - only the person who created a
// suggestion may delete it.
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.personId || !session.groupId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Suggestion id is required" }, { status: 400 });
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id } });
    if (!suggestion) {
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    if (suggestion.byPersonId !== session.personId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.suggestion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete suggestion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
