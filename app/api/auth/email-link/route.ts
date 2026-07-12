import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendLoginLinkEmail } from "@/lib/email";
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

    // Email each matching person their own group's durable link. findMany
    // matched on `normalized`, so every row's email equals it. Isolate every
    // send so one failure never aborts the others or leaks through the response.
    for (const person of people) {
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
        // Never let a send failure leak through - log it, keep the response generic.
        console.error("Failed to send login link email:", sendError);
      }
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Email-link request error:", error);
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }
}
