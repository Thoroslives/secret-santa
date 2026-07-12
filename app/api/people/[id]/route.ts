import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generatePersonalLinkToken, isValidEmail, normalizeEmail } from "@/lib/utils";
import { findEmailHolders, linkAcknowledged, EmailHolder } from "@/lib/people";

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

// DELETE a person (admin only)
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

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }

    await prisma.person.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting person:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
