import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// GET /p/<token> - durable personal login link. Each active person has exactly
// one of these (Person.personalLinkToken); visiting it logs them straight in
// and drops them on their wishlist. No code, no expiry - it's the only login
// path participants use (see app/login/page.tsx for the self-service resend).
export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const person = await prisma.person.findFirst({
    where: { personalLinkToken: params.token, active: true },
    include: { group: true },
  });

  if (!person) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", req.url));
  }

  const session = await getSession();
  session.personId = person.id;
  session.personName = person.name;
  session.groupId = person.groupId;
  session.groupName = person.group.name;
  session.loginMethod = "link";
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.redirect(new URL("/wishlist", req.url));
}
