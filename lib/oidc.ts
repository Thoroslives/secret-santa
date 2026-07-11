import * as client from "openid-client";
import type { SessionData } from "@/lib/session";

// App-native Authentik OIDC for the single super-admin (P4 Part B). The
// identity gate itself (isAllowedAdminEmail) lives in @/lib/adminAuth - this
// module only does discovery, the authorization redirect, and the callback
// token exchange. Reads env at call time everywhere except the discovery
// memo below, which is fine to hold once resolved.

const DISCOVERY_TIMEOUT_MS = 5000;

/**
 * True iff OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are all set
 * and non-empty. Lets callers decide whether to offer OIDC login at all
 * (break-glass, from Part A, works regardless of this).
 */
export function isOidcConfigured(): boolean {
  return !!(
    process.env.OIDC_ISSUER &&
    process.env.OIDC_CLIENT_ID &&
    process.env.OIDC_CLIENT_SECRET
  );
}

// Memoized discovery result, keyed by issuer so a change to OIDC_ISSUER
// (env update + restart) never serves a stale Configuration for the wrong
// issuer. Only a SUCCESSFUL discovery is memoized here - see the catch
// branch in getOidcConfig for why a failure is deliberately not cached.
let memoizedConfig: { issuer: string; config: client.Configuration } | null = null;

/**
 * Resolve (and memoize) the OIDC Configuration via Authorization Server
 * Metadata discovery.
 *
 * Returns null, rather than throwing, when:
 *  - OIDC isn't configured (isOidcConfigured() is false) - discovery is not
 *    attempted at all in this case.
 *  - OIDC_ISSUER isn't a valid URL.
 *  - discovery rejects (IdP unreachable, bad client credentials, etc).
 *  - discovery does not settle within ~5s (an unreachable IdP must not hang
 *    the caller's request forever).
 *
 * A failure is never memoized, so the next call retries discovery from
 * scratch once the IdP is back - only a resolved Configuration is cached.
 * Callers turn a null return into an error-redirect.
 */
export async function getOidcConfig(): Promise<client.Configuration | null> {
  if (!isOidcConfigured()) {
    return null;
  }

  const issuer = process.env.OIDC_ISSUER as string;
  const clientId = process.env.OIDC_CLIENT_ID as string;
  const clientSecret = process.env.OIDC_CLIENT_SECRET as string;

  if (memoizedConfig && memoizedConfig.issuer === issuer) {
    return memoizedConfig.config;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const config = await Promise.race([
      client.discovery(new URL(issuer), clientId, clientSecret),
      new Promise<client.Configuration>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("OIDC discovery timed out"));
        }, DISCOVERY_TIMEOUT_MS);
      }),
    ]);

    memoizedConfig = { issuer, config };
    return config;
  } catch (error) {
    // Unreachable/misconfigured IdP, a bad OIDC_ISSUER URL, or the timeout
    // above - none of these should ever throw out to the caller. Logged so
    // the failure is still visible operationally even though we return null.
    console.error("OIDC discovery failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the Authorization Server redirect URL for an admin OIDC login.
 * Generates a fresh PKCE verifier/challenge and state, and stashes the
 * verifier + state on the session for the callback to check against - the
 * CALLER is responsible for saving the session (this function only mutates
 * the in-memory object).
 *
 * OIDC_REDIRECT_URI is REQUIRED whenever OIDC is configured - there is no
 * host-derived fallback, since deriving it from request headers is exactly
 * the kind of thing that quietly breaks (or gets spoofed) behind a proxy.
 * Throws if it's unset; the caller turns that into an error-redirect.
 */
export async function buildAdminLoginUrl(
  config: client.Configuration,
  session: SessionData
): Promise<URL> {
  const redirectUri = process.env.OIDC_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error(
      "OIDC_REDIRECT_URI is required when OIDC is configured (no host-derived fallback)"
    );
  }

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  session.oidcVerifier = codeVerifier;
  session.oidcState = state;

  return client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
}

/**
 * Complete the callback leg of an admin OIDC login: exchange the
 * authorization code for tokens (validating the PKCE verifier and state
 * against what buildAdminLoginUrl stashed on the session) and return the
 * standard OIDC claims the caller needs for the allowlist gate.
 *
 * This function is deliberately narrow - it does not check
 * isAllowedAdminEmail (that's @/lib/adminAuth's job) and does not mutate the
 * session (clearing oidcVerifier/oidcState is the caller's job once the
 * login flow is fully resolved, success or failure). A rejection from
 * authorizationCodeGrant (bad code, state mismatch, etc) propagates to the
 * caller rather than being swallowed - unlike getOidcConfig, there is no
 * "retry later" story mid-callback.
 */
export async function completeAdminLogin(
  config: client.Configuration,
  currentUrl: URL,
  session: SessionData
): Promise<{ sub?: string; email?: string; email_verified?: boolean }> {
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: session.oidcVerifier,
    expectedState: session.oidcState,
  });

  const claims = tokens.claims();

  return {
    sub: claims?.sub,
    email: typeof claims?.email === "string" ? claims.email : undefined,
    email_verified:
      typeof claims?.email_verified === "boolean" ? claims.email_verified : undefined,
  };
}
