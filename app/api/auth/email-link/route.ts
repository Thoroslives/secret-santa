import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendLoginLinkEmail, sendAllDrawsLinkEmail } from "@/lib/email";
import { magicLinkRateLimit } from "@/lib/rate-limit";

const GENERIC_MESSAGE = "If this email is registered, a login link has been sent.";

// POST /api/auth/email-link {email} - self-service resend of a person's durable
// /p/<token> link. Looks the person up by EMAIL ALONE: the invite-code /join
// flow that used to supply a groupId is gone, so the landing sign-in posts only
// an email. Because email is unique per-group but NOT globally
// (@@unique([groupId, email])), one address can belong to more than one group -
// each such person is emailed their own group's link.
//
// Always answers with the same generic message so the response never reveals
// whether the email is registered (enumeration-safe), how many groups it's in,
// whether any send succeeded, or anything else. Only a missing email (a
// malformed request, not an enumeration signal) returns 400.
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = magicLinkRateLimit(request);
    if (!rateLimitResult.success) return rateLimitResult.response!;

    const { email } = await request.json();
    const normalized = String(email ?? "").toLowerCase().trim();

    if (!normalized) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const people = await prisma.person.findMany({
      where: { email: normalized, active: true },
      include: { group: true },
    });

    // Send the sign-in link(s). One matching person -> their own group's durable
    // link, unchanged. More than one (the same address across draws) -> ONE email
    // with ONE link: any token logs into all their draws (the wishlist resolves
    // the rest live). Isolate every send so a failure never leaks through the
    // generic response.
    if (people.length === 1) {
      const person = people[0];
      try {
        await sendLoginLinkEmail(
          normalized,
          person.name,
          person.group.name,
          `${process.env.NEXTAUTH_URL}/p/${person.personalLinkToken}`,
          person.group.organiserName,
          person.group.personalMessage
        );
      } catch (sendError) {
        console.error("Failed to send login link email:", sendError);
      }
    } else if (people.length > 1) {
      // Most recent group's token as the landing tab; no per-group personalisation.
      const sorted = [...people].sort((a, b) => b.group.year - a.group.year);
      const primary = sorted[0];
      try {
        await sendAllDrawsLinkEmail(
          normalized,
          primary.name,
          sorted.map((p) => p.group.name),
          `${process.env.NEXTAUTH_URL}/p/${primary.personalLinkToken}`
        );
      } catch (sendError) {
        console.error("Failed to send all-draws login link email:", sendError);
      }
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Email-link request error:", error);
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
