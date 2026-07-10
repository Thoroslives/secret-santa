import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendLoginLinkEmail } from "@/lib/email";
import { magicLinkRateLimit } from "@/lib/rate-limit";

const GENERIC_MESSAGE = "If this email is registered, a login link has been sent.";

// POST /api/auth/email-link {email, groupId} - self-service resend of a
// person's durable /p/<token> link. Always answers with the same generic
// message so the response never reveals whether an email is registered
// (enumeration-safe), whether the send actually succeeded, or anything else.
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = magicLinkRateLimit(request);
    if (!rateLimitResult.success) return rateLimitResult.response!;

    const { email, groupId } = await request.json();

    if (!email || !groupId) {
      return NextResponse.json(
        { error: "Email and group ID are required" },
        { status: 400 }
      );
    }

    const person = await prisma.person.findFirst({
      where: {
        groupId,
        email: String(email).toLowerCase().trim(),
        active: true,
      },
      include: { group: true },
    });

    if (person?.email) {
      try {
        await sendLoginLinkEmail(
          person.email,
          person.name,
          person.group.name,
          `${process.env.NEXTAUTH_URL}/p/${person.personalLinkToken}`
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
