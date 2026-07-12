import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generatePersonalLinkToken, isValidEmail, normalizeEmail } from "@/lib/utils";
import { findEmailHolders, linkAcknowledged, EmailHolder } from "@/lib/people";
import { getRound, RESET_TO_DRAFT } from "@/lib/rounds";

// Prisma's unique-constraint violation. Matched on the code rather than with
// `instanceof PrismaClientKnownRequestError`, because that class only exists on the
// GENERATED client - under jest `@prisma/client` resolves to the stub index and the
// instanceof silently becomes a TypeError.
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

// PATCH a person (admin only). Three admin actions, any combination per call:
//   { active: boolean }    - enable/disable their durable link without losing
//                            history (wishlist, assignments).
//   { rotateLink: true }   - reissue a fresh personalLinkToken, invalidating the
//                            old /p/<token> link (use if a link leaks).
//   { email: string|null } - set, change, or clear their email.
//
// The email is NOT just a contact field: it is the cross-group identity key.
// Everyone sharing an address is a switchable "draw" of the same person
// (lib/draws.ts), so changing one re-shapes who can open which draw and see whose
// match. Hence the confirmation flow below. `active` and `rotateLink` are ordinary
// single-row controls and are deliberately kept OUT of all of it.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { id } = params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const fields = body as Record<string, unknown>;
    const { active, rotateLink, applyToAll, acknowledgedLinkIds } = fields;

    // The ONLY gate into the email pipeline. Deactivate and Rotate-link are live
    // controls on this same endpoint and send no `email` key; without this check an
    // absent email would normalise to null exactly like an intentional clear, and
    // clicking Deactivate would wipe the person's address (or 409 at the admin, since
    // a multi-draw person always has siblings).
    const editingEmail = "email" in fields;

    if (typeof active !== "boolean" && rotateLink !== true && !editingEmail) {
      return NextResponse.json(
        { error: "Provide `email`, `active` (boolean) and/or `rotateLink: true`" },
        { status: 400 }
      );
    }

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    // Written to THIS person only. `active` and `rotateLink` never fan out to
    // siblings: personalLinkToken is @unique, so one shared token written to N rows is
    // a constraint violation, and a cross-group deactivation would kill the person's
    // login everywhere at once.
    const selfData: { active?: boolean; personalLinkToken?: string; email?: string | null } = {};
    if (typeof active === "boolean") selfData.active = active;
    if (rotateLink === true) selfData.personalLinkToken = generatePersonalLinkToken();

    // Siblings that the email change should follow, when the admin says so.
    let emailSiblingIds: string[] = [];

    if (editingEmail) {
      // Only a string or an explicit null means anything here. Without this, a
      // stray `{ email: 42 }` would normalise to null and silently CLEAR the
      // person's address - the same "absent looks like cleared" hazard the
      // `"email" in fields` gate above exists to prevent, one level down.
      if (fields.email !== null && typeof fields.email !== "string") {
        return NextResponse.json(
          { error: "Please enter a valid email address" },
          { status: 400 }
        );
      }

      const normalized = normalizeEmail(fields.email);

      // Unchanged? Skip the rest of the email work, but let active/rotateLink through.
      if (normalized !== person.email) {
        if (normalized !== null && !isValidEmail(normalized)) {
          return NextResponse.json(
            { error: "Please enter a valid email address" },
            { status: 400 }
          );
        }

        // Everyone else on this person's OLD address: the same human's other draws.
        // These are the rows that would ALSO change under "all draws".
        const siblings = person.email
          ? await findEmailHolders(person.email, [person.id])
          : [];
        const maxTargets = [person.id, ...siblings.map((s) => s.id)];

        // Clearing needs no lookups at all: null has no holders, and SQLite treats
        // NULLs as distinct so it can never collide.
        let linksTo: EmailHolder[] = [];
        if (normalized) {
          // One query answers both questions below.
          const holders = await findEmailHolders(normalized, maxTargets);

          // Taken inside this person's own group? Then it cannot be written at all -
          // @@unique([groupId, email]) would refuse it. Answered BEFORE the
          // confirmation, so the dialog never offers to "link" something that will
          // then 400. Everything left over is therefore in ANOTHER group.
          if (holders.some((h) => h.groupId === person.groupId)) {
            return NextResponse.json(
              { error: "Email is already used in this group" },
              { status: 400 }
            );
          }

          // Writing the address is legal - and it MERGES them: they become switchable
          // siblings and can open each other's draw. Intended when it is the same
          // human, catastrophic when it is not, so it is confirmed, never silent.
          linksTo = holders;
        }

        const needsScope = siblings.length > 0 && !("applyToAll" in fields);
        const needsLinkAck = !linkAcknowledged(linksTo, acknowledgedLinkIds);

        if (needsScope || needsLinkAck) {
          return NextResponse.json(
            // `email` is the SERVER's canonical form. The dialog's whole job is to show
            // the exact address about to be written, so it must not render the client's
            // own guess at it.
            { needsConfirmation: true, email: normalized, siblings, linksTo },
            { status: 409 }
          );
        }

        if (applyToAll === true) {
          emailSiblingIds = siblings.map((s) => s.id);

          // Now the scope is known: the address must also be free in the groups we are
          // about to write it into. No new query - `linksTo` already holds every other
          // holder of this address, and every one of them is in another group.
          const targetGroupIds = new Set(siblings.map((s) => s.groupId));
          const clash = linksTo.find((h) => targetGroupIds.has(h.groupId));
          if (clash) {
            return NextResponse.json(
              { error: `Email is already used in ${clash.groupName}` },
              { status: 400 }
            );
          }
        }

        selfData.email = normalized;
      }
    }

    // Nothing to do (e.g. the email was already what was asked for).
    if (Object.keys(selfData).length === 0) {
      return NextResponse.json({ person, drawsUpdated: 0 });
    }

    let updated;
    if (emailSiblingIds.length > 0) {
      // Fanning the address out across draws. Array-form transaction, matching every
      // other $transaction in this app, so a multi-draw edit is all-or-nothing. Only
      // the EMAIL fans out; selfData's token/active stay on this row.
      await prisma.$transaction([
        prisma.person.update({ where: { id }, data: selfData }),
        prisma.person.updateMany({
          where: { id: { in: emailSiblingIds } },
          data: { email: selfData.email },
        }),
      ]);
      // updateMany returns a count, not rows, so re-read for the response.
      updated = await prisma.person.findUnique({ where: { id } });
    } else {
      // The ordinary path (any single-row edit, including Deactivate and Rotate-link):
      // one write, which hands the fresh row straight back.
      updated = await prisma.person.update({ where: { id }, data: selfData });
    }

    // How many draws the address actually landed in. The admin only ever looks at ONE
    // group's people list, so a fan-out into another draw would otherwise leave no
    // visible evidence anywhere - and this app has no audit trail and no undo.
    const drawsUpdated = "email" in selfData ? emailSiblingIds.length + 1 : 0;

    return NextResponse.json({ person: updated, drawsUpdated });
  } catch (error) {
    // The DB unique index is the real guard; the checks above only exist to produce a
    // friendly message. Never let a collision surface as a 500.
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Email is already used in this group" },
        { status: 400 }
      );
    }
    console.error("Error updating person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Thrown inside the delete transaction when a concurrent send flips the round to
// `sent` after we classified it. Rolls the whole transaction back.
class RoundSentDuringDelete extends Error {}

// One remedy, one wording. The organiser is pointed at the deliberate "clear the draw"
// action rather than having it happen as a side effect of removing one person.
const SENT_DRAW_REFUSAL =
  "This year's matches have already been sent, and this person is in the draw. " +
  "Reset the draw first, then remove them and draw again.";

// DELETE a person (admin only).
//
// Deleting a person cascades their Assignment rows away (they are the giver on one
// and the receiver on another). That is what stranded the live group on 2026-07-13:
// the rows vanished, `Round.status` stayed `sent`, and generate refuses a `sent`
// round - a dead end with no way out of the UI. So the round has to be kept honest
// here. Three cases, and which one applies turns on whether this person is ACTUALLY
// part of the current draw:
//
//   1. Not in the active draw  -> just delete them. The draw survives their removal
//      intact, so touching it would destroy a perfectly good (possibly already sent)
//      draw for nothing.
//   2. In a draw already SENT  -> 409. Their removal would tear a hole in matches the
//      family has already opened. Resetting the draw stays a deliberate, separate act.
//   3. In a draw never sent    -> the permutation is genuinely broken by their removal
//      (their giver loses a giftee, their giftee loses a giver) and nothing has been
//      communicated, so the draw goes with them and the round returns to `draft`.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();

    if (!session.isAdmin) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 403 });
    }

    const { id } = params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: { group: { select: { year: true } } },
    });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    const round = await getRound(person.groupId, person.group.year);

    // BOTH cascade edges count. Someone who only ever receives still has a row
    // (their giver -> them); deleting them tears that giver's match out of the draw
    // just as surely. A giver-only check would wave them through as "not involved".
    const inActiveDraw = round
      ? (await prisma.assignment.count({
          where: { roundId: round.id, OR: [{ giverId: id }, { receiverId: id }] },
        })) > 0
      : false;

    // Case 2.
    if (inActiveDraw && round?.status === "sent") {
      return NextResponse.json({ error: SENT_DRAW_REFUSAL }, { status: 409 });
    }

    // Case 1.
    if (!inActiveDraw || !round) {
      await prisma.person.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    // Case 3. An INTERACTIVE transaction, because the round has to be compare-and-swapped:
    // the status was read outside it, and POST /api/rounds/send awaits one SMTP call per
    // person, so it can flip the round to `sent` inside that window. If the swap loses, the
    // whole thing rolls back - deleting the assignments regardless would leave rows gone
    // with the status still `sent`, which is the exact stranded state this route now fixes.
    //
    // Everything is scoped by roundId, never (groupId, year): a concurrent rollover moves
    // the group's year pointer, and a year-scoped write would then shred the wrong round.
    try {
      await prisma.$transaction(async (tx) => {
        const swapped = await tx.round.updateMany({
          where: { id: round.id, status: { in: ["draft", "generated"] } },
          data: RESET_TO_DRAFT,
        });
        if (swapped.count === 0) {
          throw new RoundSentDuringDelete();
        }
        await tx.assignment.deleteMany({ where: { roundId: round.id } });
        await tx.person.delete({ where: { id } });
      });
    } catch (error) {
      if (error instanceof RoundSentDuringDelete) {
        return NextResponse.json({ error: SENT_DRAW_REFUSAL }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
