import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { getActiveYear } from "@/lib/rounds";
import { sendMatchReadyEmail } from "@/lib/email";

// POST /api/rounds/send {groupId}         -> flip the round to `sent` (this is
//                                             what makes matches visible to
//                                             participants), then best-effort
//                                             email each giver a "your match is
//                                             ready" note and return the
//                                             copyable share-links.
// POST /api/rounds/send?revert=1 {groupId} -> flip `sent` back to `generated`
//                                             (re-hides the matches; note it
//                                             cannot un-see what was already
//                                             opened - it just stops further
//                                             exposure).
//
// Idempotent: calling send again on an already-sent round re-runs the email
// loop (a resend) without changing status. Emails are best-effort - the round
// still becomes `sent` even if some fail; the share-links view is the reliable
// distribution channel. The year is always the group's active year, resolved
// server-side - never client-supplied.
export async function POST(request: NextRequest) {
  try {
    const revert = new URL(request.url).searchParams.get("revert") === "1";
    const { groupId } = await request.json();
    if (!groupId) {
      return NextResponse.json({ error: "Group ID is required" }, { status: 400 });
    }

    const forbidden = await requireAdmin();
    if (forbidden) return forbidden;

    const currentYear = await getActiveYear(groupId);
    const round = await prisma.round.findUnique({
      where: { groupId_year: { groupId, year: currentYear } },
    });
    if (!round) {
      return NextResponse.json({ error: "No draw to send; generate one first." }, { status: 400 });
    }

    if (revert) {
      if (round.status !== "sent") {
        return NextResponse.json({ error: "This round is not sent; nothing to revert." }, { status: 400 });
      }
      await prisma.round.update({
        where: { id: round.id },
        data: { status: "generated", sentAt: null },
      });
      return NextResponse.json({ status: "generated", reverted: true });
    }

    if (round.status === "draft") {
      return NextResponse.json({ error: "Generate a draw before sending." }, { status: 400 });
    }

    // Flip to sent (idempotent - an already-sent round stays sent + resends).
    if (round.status === "generated") {
      await prisma.round.update({
        where: { id: round.id },
        data: { status: "sent", sentAt: new Date() },
      });
    }

    const assignments = await prisma.assignment.findMany({
      where: { roundId: round.id },
      include: { giver: true },
    });
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    const baseUrl = process.env.NEXTAUTH_URL || "";

    let sent = 0;
    let failed = 0;
    const shareLinks: { name: string; link: string }[] = [];

    for (const a of assignments) {
      if (!a.giver.active) continue;
      const link = `${baseUrl}/p/${a.giver.personalLinkToken}`;
      shareLinks.push({ name: a.giver.name, link });
      if (a.giver.email) {
        const ok = await sendMatchReadyEmail(
          a.giver.email,
          a.giver.name,
          group?.name || "Secret Santa",
          link,
          group?.organiserName,
          group?.personalMessage
        );
        if (ok) sent++;
        else failed++;
      }
    }

    return NextResponse.json({ status: "sent", sent, failed, shareLinks });
  } catch (error) {
    console.error("Send round error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
