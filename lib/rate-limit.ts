import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically. unref() so this timer never keeps
// the Node process (or the jest runner) alive on its own - it only fires while
// something else is keeping the event loop running.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute
cleanupTimer.unref?.();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(
  request: NextRequest,
  key: string,
  config: RateLimitConfig
): { success: boolean; response?: NextResponse } {
  const ip = getClientIp(request);
  const rateLimitKey = `${key}:${ip}`;
  const now = Date.now();

  const entry = rateLimitStore.get(rateLimitKey);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(rateLimitKey, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { success: true };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return {
      success: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
          },
        }
      ),
    };
  }

  entry.count++;
  return { success: true };
}

// Pre-configured rate limiters for common use cases
export const authRateLimit = (request: NextRequest) =>
  rateLimit(request, "auth", { windowMs: 15 * 60 * 1000, maxRequests: 10 }); // 10 attempts per 15 minutes

export const magicLinkRateLimit = (request: NextRequest) =>
  rateLimit(request, "magic-link", { windowMs: 15 * 60 * 1000, maxRequests: 5 }); // 5 per 15 minutes

export const adminAuthRateLimit = (request: NextRequest) =>
  rateLimit(request, "admin-auth", { windowMs: 15 * 60 * 1000, maxRequests: 10 }); // 10 per 15 minutes
