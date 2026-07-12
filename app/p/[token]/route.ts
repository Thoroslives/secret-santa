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
    // Relative redirect (see below) - resolve against the browser's origin.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: "/login?error=invalid-link" },
    });
  }

  const session = await getSession();
  session.personId = person.id;
  session.personName = person.name;
  session.groupId = person.groupId;
  session.groupName = person.group.name;
  session.loginMethod = "link";
  session.isLoggedIn = true;
  await session.save();

  // Relative redirect: resolves against the browser's own origin, so it works
  // in dev (browser reaches the dev server through a tunnel/forward) and in
  // prod (behind the reverse proxy) alike. Building an absolute URL from
  // req.url leaks the server's bind host (e.g. 0.0.0.0), which the browser
  // cannot reach.
  return new NextResponse(null, { status: 307, headers: { Location: "/wishlist" } });
}
