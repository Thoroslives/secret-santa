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
