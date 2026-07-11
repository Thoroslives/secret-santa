import { createHash, timingSafeEqual } from "crypto";

// Parse ADMIN_OIDC_ALLOWED_EMAILS into a normalized allowlist. Read fresh on
// every call (never cached at module load) so a config change - or a test
// setting/unsetting the env var - always takes effect immediately.
function parseAllowedEmails(): string[] {
  const raw = process.env.ADMIN_OIDC_ALLOWED_EMAILS;
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Decide whether an OIDC-authenticated email may act as the super-admin.
 * Not a secret comparison (it's a public-ish allowlist check), so plain
 * membership is fine here - the constant-time requirement below applies
 * only to verifyBreakGlass.
 *
 * Returns false unless ALL of:
 *  - `verified` is exactly `true` (the OIDC provider vouched for the email)
 *  - ADMIN_OIDC_ALLOWED_EMAILS parses to a non-empty allowlist
 *  - `email`, trimmed and lowercased, is a member of that allowlist
 */
export function isAllowedAdminEmail(
  email: string | undefined | null,
  verified: boolean | undefined | null
): boolean {
  if (verified !== true) {
    return false;
  }

  const allowlist = parseAllowedEmails();
  if (allowlist.length === 0) {
    return false;
  }

  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  return allowlist.includes(normalizedEmail);
}

/**
 * Length-safe, constant-time check of a break-glass admin password against
 * ADMIN_BREAKGLASS_PASSWORD. No bcrypt, no DB, no seed - env-only.
 *
 * Both sides are hashed to a fixed 32-byte sha256 digest before comparison,
 * so crypto.timingSafeEqual always receives equal-length buffers and never
 * throws on a length mismatch between `password` and the configured value -
 * that is the whole point of hashing first, rather than comparing the raw
 * strings.
 */
export function verifyBreakGlass(password: string | undefined | null): boolean {
  const configured = process.env.ADMIN_BREAKGLASS_PASSWORD;
  if (!configured) {
    return false;
  }

  if (!password) {
    return false;
  }

  const configuredHash = createHash("sha256").update(configured).digest();
  const suppliedHash = createHash("sha256").update(password).digest();
  return timingSafeEqual(configuredHash, suppliedHash);
}

/**
 * True iff a break-glass password is configured (ADMIN_BREAKGLASS_PASSWORD
 * set and non-empty). Lets callers decide whether to offer break-glass login
 * at all, without leaking the configured value.
 */
export function isBreakGlassConfigured(): boolean {
  return !!process.env.ADMIN_BREAKGLASS_PASSWORD;
}
