import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOidcConfig, completeAdminLogin, oidcCallbackUrl } from "@/lib/oidc";
import { isAllowedAdminEmail } from "@/lib/adminAuth";

// Force dynamic: this handler branches on runtime env (getOidcConfig reads
// process.env.OIDC_*) and must never be statically prerendered. It already
// reads request.url so Next treats it as dynamic, but declare it explicitly so
// a future refactor can't accidentally make it static (see the login route).
export const dynamic = "force-dynamic";

// GET /api/admin/oidc/callback - completes the admin OIDC authorization-code
// exchange. THE auth boundary: session.isAdmin is set in exactly one place
// below, and only after a successful exchange AND isAllowedAdminEmail(email,
// email_verified) === true. Never 500s to the browser - every failure mode
// is a fixed-enum redirect, never a reflected IdP/user-supplied string. Every
// app-internal redirect is a RELATIVE Location so the browser resolves it
// against its own origin; an absolute URL built from request.url would leak the
// app's internal bind host (e.g. 0.0.0.0:3000) behind the reverse proxy, which
// the browser cannot reach (same reason as app/p/[token]/route.ts).
function relRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session.oidcVerifier || !session.oidcState) {
    // No pending flow on this session (expired, already consumed, or a bare
    // hit of the callback URL) - nothing was stashed, so there's nothing to
    // clear either.
    return relRedirect("/admin?error=oidc_state");
  }

  const config = await getOidcConfig();
  if (!config) {
    return relRedirect("/admin?error=oidc_unavailable");
  }

  let result: { sub?: string; email?: string; email_verified?: boolean };
  try {
    result = await completeAdminLogin(config, oidcCallbackUrl(request.url), session);
  } catch (error) {
    // Bad code, state mismatch, an IdP-side error param, an expired code,
    // etc - the rejection is never inspected for redirect purposes, only
    // logged. The transient state is deliberately left as-is here (only the
    // not-authorized and success paths below clear it): it is useless
    // without a matching, already-spent authorization code, and a fresh
    // login attempt overwrites it anyway.
    console.error("Admin OIDC callback exchange failed:", error);
    return relRedirect("/admin?error=oidc_failed");
  }

  const { sub, email, email_verified } = result;

  // THE GATE. Reuses @/lib/adminAuth's isAllowedAdminEmail (A2) rather than
  // re-checking verification/allowlist membership here - single source of
  // truth for who may hold the super-admin session.
  if (!isAllowedAdminEmail(email, email_verified)) {
    session.oidcVerifier = undefined;
    session.oidcState = undefined;
    await session.save();
    return relRedirect("/admin?error=not_authorized");
  }

  // Structured audit line - sub + email only, never tokens/secrets.
  console.info("Admin OIDC login succeeded:", { sub, email });

  session.isAdmin = true;
  session.adminEmail = email;
  session.adminLoginMethod = "oidc";
  session.oidcVerifier = undefined;
  session.oidcState = undefined;
  await session.save();

  return relRedirect("/admin/dashboard");
}
