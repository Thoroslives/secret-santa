import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getOidcConfig, completeAdminLogin } from "@/lib/oidc";
import { isAllowedAdminEmail } from "@/lib/adminAuth";

// GET /api/admin/oidc/callback - completes the admin OIDC authorization-code
// exchange. THE auth boundary: session.isAdmin is set in exactly one place
// below, and only after a successful exchange AND isAllowedAdminEmail(email,
// email_verified) === true. Never 500s to the browser - every failure mode
// is a fixed-enum redirect, never a reflected IdP/user-supplied string, and
// every redirect target is relative (built from request.url), never an
// IdP-supplied URL.
export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session.oidcVerifier || !session.oidcState) {
    // No pending flow on this session (expired, already consumed, or a bare
    // hit of the callback URL) - nothing was stashed, so there's nothing to
    // clear either.
    return NextResponse.redirect(new URL("/admin?error=oidc_state", request.url));
  }

  const config = await getOidcConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/admin?error=oidc_unavailable", request.url));
  }

  let result: { sub?: string; email?: string; email_verified?: boolean };
  try {
    result = await completeAdminLogin(config, new URL(request.url), session);
  } catch (error) {
    // Bad code, state mismatch, an IdP-side error param, an expired code,
    // etc - the rejection is never inspected for redirect purposes, only
    // logged. The transient state is deliberately left as-is here (only the
    // not-authorized and success paths below clear it): it is useless
    // without a matching, already-spent authorization code, and a fresh
    // login attempt overwrites it anyway.
    console.error("Admin OIDC callback exchange failed:", error);
    return NextResponse.redirect(new URL("/admin?error=oidc_failed", request.url));
  }

  const { sub, email, email_verified } = result;

  // THE GATE. Reuses @/lib/adminAuth's isAllowedAdminEmail (A2) rather than
  // re-checking verification/allowlist membership here - single source of
  // truth for who may hold the super-admin session.
  if (!isAllowedAdminEmail(email, email_verified)) {
    session.oidcVerifier = undefined;
    session.oidcState = undefined;
    await session.save();
    return NextResponse.redirect(new URL("/admin?error=not_authorized", request.url));
  }

  // Structured audit line - sub + email only, never tokens/secrets.
  console.info("Admin OIDC login succeeded:", { sub, email });

  session.isAdmin = true;
  session.adminEmail = email;
  session.adminLoginMethod = "oidc";
  session.oidcVerifier = undefined;
  session.oidcState = undefined;
  await session.save();

  return NextResponse.redirect(new URL("/admin/dashboard", request.url));
}
