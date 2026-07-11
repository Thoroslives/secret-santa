import {
  isAllowedAdminEmail,
  verifyBreakGlass,
  isBreakGlassConfigured,
} from '@/lib/adminAuth';

// This module reads ADMIN_OIDC_ALLOWED_EMAILS and ADMIN_BREAKGLASS_PASSWORD
// fresh on every call (never cached at module load - see lib/adminAuth.ts).
// Save/restore both around every test so env changes in one case never leak
// into the next.
const ENV_KEYS = ['ADMIN_OIDC_ALLOWED_EMAILS', 'ADMIN_BREAKGLASS_PASSWORD'] as const;
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('isAllowedAdminEmail', () => {
  it('returns true when verified, allowlisted, and the email matches exactly', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com,bob@example.com';
    expect(isAllowedAdminEmail('alice@example.com', true)).toBe(true);
  });

  it('returns false when the email is not verified', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('alice@example.com', false)).toBe(false);
  });

  it('returns false when verified is undefined', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('alice@example.com', undefined)).toBe(false);
  });

  it('returns false when verified is null', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('alice@example.com', null)).toBe(false);
  });

  it('returns false when the email is not in the allowlist', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('mallory@example.com', true)).toBe(false);
  });

  it('returns false when the allowlist env var is unset', () => {
    delete process.env.ADMIN_OIDC_ALLOWED_EMAILS;
    expect(isAllowedAdminEmail('alice@example.com', true)).toBe(false);
  });

  it('returns false when the allowlist env var is an empty string', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = '';
    expect(isAllowedAdminEmail('alice@example.com', true)).toBe(false);
  });

  it('returns false when the allowlist parses to empty (commas/whitespace only)', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = ' , , ';
    expect(isAllowedAdminEmail('alice@example.com', true)).toBe(false);
  });

  it('matches case-insensitively when the allowlist entry is uppercase', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'Alice@Example.com';
    expect(isAllowedAdminEmail('alice@example.com', true)).toBe(true);
  });

  it('matches case-insensitively when the supplied email is uppercase', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('ALICE@EXAMPLE.COM', true)).toBe(true);
  });

  it('trims whitespace around allowlist entries after splitting on commas', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = '  alice@example.com  ,  bob@example.com  ';
    expect(isAllowedAdminEmail('bob@example.com', true)).toBe(true);
  });

  it('trims whitespace on the supplied email before matching', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('  alice@example.com  ', true)).toBe(true);
  });

  it('returns false for an undefined email', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail(undefined, true)).toBe(false);
  });

  it('returns false for a null email', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail(null, true)).toBe(false);
  });

  it('returns false for an empty-string email', () => {
    process.env.ADMIN_OIDC_ALLOWED_EMAILS = 'alice@example.com';
    expect(isAllowedAdminEmail('', true)).toBe(false);
  });
});

describe('verifyBreakGlass', () => {
  it('returns true when the password matches the configured value', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass('correct-horse-battery-staple')).toBe(true);
  });

  it('returns false when the password does not match', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass('wrong-password')).toBe(false);
  });

  it('returns false when the password differs only by case', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass('Correct-Horse-Battery-Staple')).toBe(false);
  });

  it('returns false when ADMIN_BREAKGLASS_PASSWORD is unset', () => {
    delete process.env.ADMIN_BREAKGLASS_PASSWORD;
    expect(verifyBreakGlass('anything')).toBe(false);
  });

  it('returns false when ADMIN_BREAKGLASS_PASSWORD is an empty string', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = '';
    expect(verifyBreakGlass('anything')).toBe(false);
  });

  it('returns false when the supplied password is undefined', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass(undefined)).toBe(false);
  });

  it('returns false when the supplied password is null', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass(null)).toBe(false);
  });

  it('returns false when the supplied password is an empty string', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(verifyBreakGlass('')).toBe(false);
  });

  it('does not throw and returns false when the supplied password is shorter than configured', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'a-very-long-break-glass-password';
    expect(() => verifyBreakGlass('short')).not.toThrow();
    expect(verifyBreakGlass('short')).toBe(false);
  });

  it('does not throw and returns false when the supplied password is longer than configured', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'short';
    expect(() => verifyBreakGlass('a-much-longer-supplied-password')).not.toThrow();
    expect(verifyBreakGlass('a-much-longer-supplied-password')).toBe(false);
  });

  it('does not throw on a large length mismatch (1-char vs 1000-char)', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'x';
    const longWrong = 'y'.repeat(1000);
    expect(() => verifyBreakGlass(longWrong)).not.toThrow();
    expect(verifyBreakGlass(longWrong)).toBe(false);
  });
});

describe('isBreakGlassConfigured', () => {
  it('returns true when ADMIN_BREAKGLASS_PASSWORD is set and non-empty', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = 'correct-horse-battery-staple';
    expect(isBreakGlassConfigured()).toBe(true);
  });

  it('returns false when ADMIN_BREAKGLASS_PASSWORD is unset', () => {
    delete process.env.ADMIN_BREAKGLASS_PASSWORD;
    expect(isBreakGlassConfigured()).toBe(false);
  });

  it('returns false when ADMIN_BREAKGLASS_PASSWORD is an empty string', () => {
    process.env.ADMIN_BREAKGLASS_PASSWORD = '';
    expect(isBreakGlassConfigured()).toBe(false);
  });
});
