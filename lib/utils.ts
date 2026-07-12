import { randomBytes } from "crypto";

// Generate a durable, unguessable personal-link token for a person (32 random
// bytes, base64url-encoded - no padding/slashes, safe to embed in a URL path).
export function generatePersonalLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

// Generate a unique group invite code (6 characters, alphanumeric)
export function generateGroupInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude similar looking chars
  let code = "";
  const bytes = randomBytes(6);

  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }

  return code;
}

// The canonical form of an address. This is not cosmetic: email IS the cross-group
// identity key (lib/draws.ts), the column is plain TEXT with no COLLATE NOCASE, and
// SQLite therefore compares it case-sensitively. So "Nan@x.com" and "nan@x.com" would
// be two different people - the merge guard would not fire, @@unique([groupId, email])
// would not fire, and the draw switcher would quietly stop linking their draws. Every
// reader and writer of Person.email goes through here.
// Returns null for anything blank: an absent address, not an empty string.
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

// Pragmatic format check: something@something.tld, no whitespace. Deliberately not
// RFC-perfect - it matches the intent of <input type="email">, and exists so an address
// cannot be stored in a shape that could never receive a sign-in or match-ready email.
// Call it on an already-normalised value.
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate wishlist items (0-5 items; each needs a title, note is optional free text or a URL).
// An empty list is valid - it clears the person's wishlist.
export function validateWishlistItems(items: Array<{ title: string; note?: string }>): { valid: boolean; error?: string } {
  if (items.length === 0) {
    return { valid: true };
  }

  if (items.length > 5) {
    return { valid: false, error: "You can have a maximum of 5 wishlist items" };
  }

  for (const item of items) {
    if (!item.title || item.title.trim().length === 0) {
      return { valid: false, error: "All items must have a title" };
    }
  }

  return { valid: true };
}
