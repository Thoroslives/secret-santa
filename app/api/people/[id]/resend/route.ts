import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { sendMatchReadyEmail } from "@/lib/email";

// POST /api/people/[id]/resend (admin only) - re-send ONE person their
// "your match is ready" email.
//
// Exists because fixing a wrong address is useless on its own: on an already-sent
// round the only delivery path was re-POSTing /api/rounds/send, which re-emails
// EVERY giver in the group (duplicate mail to the whole family, plus resends to
// addresses already known to bounce). This mails exactly one person and never
// touches the round's status.
//
// It also mails a PERMANENT login credential: /p/<token> has no expiry, and a
// plausible typo like nan@gmial.com passes any sane format check. So the response
// echoes the exact address it mailed, and the UI states it in the confirm - that
// echo is what makes a typo visible at the moment it would do damage.
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const person = await prisma.person.findUnique({
      where: { id: params.id },
      include: { group: true },
    });
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    if (!person.active) {
      return NextResponse.json(
        { error: "This person is deactivated." },
        { status: 400 }
      );
    }
    if (!person.email) {
      return NextResponse.json(
        { error: "This person has no email address." },
        { status: 400 }
      );
    }

    // The group's active year, already in hand from the include above.
    const round = await prisma.round.findUnique({
      where: { groupId_year: { groupId: person.groupId, year: person.group.year } },
    });
    if (!round || round.status !== "sent") {
      return NextResponse.json(
        { error: "This draw has not been sent yet." },
        { status: 400 }
      );
    }

    // Someone added AFTER the draw was generated has no match. Telling them their
    // match is ready would be a lie - they would sign in to an empty page.
    const assignment = await prisma.assignment.findFirst({
      where: { roundId: round.id, giverId: person.id },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "This person is not in the current draw." },
        { status: 400 }
      );
    }

    const link = `${process.env.NEXTAUTH_URL || ""}/p/${person.personalLinkToken}`;
    const ok = await sendMatchReadyEmail(
      person.email,
      person.name,
      person.group.name,
      link,
      person.group.organiserName,
      person.group.personalMessage
    );

    if (!ok) {
      return NextResponse.json(
        { error: `Could not send to ${person.email}. Check the mail settings.` },
        { status: 502 }
      );
    }

    return NextResponse.json({ sent: true, email: person.email });
  } catch (error) {
    console.error("Error resending match email:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
