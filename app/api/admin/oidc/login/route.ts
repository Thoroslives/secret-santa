import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isOidcConfigured, getOidcConfig, buildAdminLoginUrl } from "@/lib/oidc";

// GET /api/admin/oidc/login - starts the admin OIDC authorization-code + PKCE
// flow (Part B, the OIDC way in; break-glass in Part A is the other). Never
// 500s to the browser - every failure mode here collapses to the same fixed
// /admin?error=oidc_unavailable redirect, since none of them ("OIDC isn't
// configured", "the IdP is unreachable", "OIDC_REDIRECT_URI is unset") are
// actionable for the browser beyond "OIDC login isn't available right now".
export async function GET(request: NextRequest) {
  if (!isOidcConfigured()) {
    return NextResponse.redirect(new URL("/admin?error=oidc_unavailable", request.url));
  }

  const config = await getOidcConfig();
  if (!config) {
    // Unreachable/misconfigured IdP - getOidcConfig() already logged the
    // underlying cause, nothing more to add here.
    return NextResponse.redirect(new URL("/admin?error=oidc_unavailable", request.url));
  }

  const session = await getSession();

  let url: URL;
  try {
    // buildAdminLoginUrl is ASYNC (awaits the PKCE challenge) and, as a side
    // effect, stashes oidcVerifier/oidcState onto `session` for the callback
    // to recover. A throw here (e.g. OIDC_REDIRECT_URI unset while OIDC is
    // otherwise configured) happens before any session field is touched.
    url = await buildAdminLoginUrl(config, session);
  } catch (error) {
    console.error("Failed to build admin OIDC login URL:", error);
    return NextResponse.redirect(new URL("/admin?error=oidc_unavailable", request.url));
  }

  // Cookie-on-redirect: same pattern as app/p/[token]/route.ts - getSession()
  // (next/headers cookies) is mutated in place and session.save() is called
  // BEFORE returning the redirect. Next.js reflects the mutated cookie store
  // onto whatever response the handler returns, so oidcVerifier/oidcState
  // reach the browser on THIS redirect and are readable again on the
  // callback hit.
  await session.save();

  return NextResponse.redirect(url.href);
}
