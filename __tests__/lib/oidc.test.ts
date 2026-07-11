import type { Configuration } from 'openid-client';
import type { SessionData } from '@/lib/session';

// Mock openid-client entirely - never hit the network. Named-export factory
// (not automock) because the real package is ESM-only; this mirrors the
// jest.mock('nodemailer', factory) pattern in email.test.ts.
jest.mock('openid-client', () => ({
  __esModule: true,
  discovery: jest.fn(),
  randomPKCECodeVerifier: jest.fn(),
  calculatePKCECodeChallenge: jest.fn(),
  randomState: jest.fn(),
  buildAuthorizationUrl: jest.fn(),
  authorizationCodeGrant: jest.fn(),
}));

import {
  isOidcConfigured,
  getOidcConfig,
  buildAdminLoginUrl,
  completeAdminLogin,
} from '@/lib/oidc';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const client = require('openid-client');

const mockConfig = {} as Configuration;

// This module reads OIDC_ISSUER/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET/
// OIDC_REDIRECT_URI fresh (see lib/oidc.ts). Save/restore all four around
// every test so env changes in one case never leak into the next.
const ENV_KEYS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
] as const;
let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  jest.clearAllMocks();
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
  jest.useRealTimers();
});

describe('isOidcConfigured', () => {
  it('returns true when all three OIDC env vars are set and non-empty', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    expect(isOidcConfigured()).toBe(true);
  });

  it('returns false when OIDC_ISSUER is unset', () => {
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when OIDC_CLIENT_ID is unset', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when OIDC_CLIENT_SECRET is unset', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when all three are unset', () => {
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when OIDC_ISSUER is an empty string', () => {
    process.env.OIDC_ISSUER = '';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when OIDC_CLIENT_ID is an empty string', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = '';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    expect(isOidcConfigured()).toBe(false);
  });

  it('returns false when OIDC_CLIENT_SECRET is an empty string', () => {
    process.env.OIDC_ISSUER = 'https://idp.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = '';
    expect(isOidcConfigured()).toBe(false);
  });
});

describe('getOidcConfig', () => {
  it('resolves null without calling discovery when unconfigured', async () => {
    await expect(getOidcConfig()).resolves.toBeNull();
    expect(client.discovery).not.toHaveBeenCalled();
  });

  it('calls discovery with new URL(issuer), clientId, clientSecret and returns its result', async () => {
    process.env.OIDC_ISSUER = 'https://idp-basic.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    const resolvedConfig = { fake: 'config-basic' };
    client.discovery.mockResolvedValueOnce(resolvedConfig);

    const result = await getOidcConfig();

    expect(result).toBe(resolvedConfig);
    expect(client.discovery).toHaveBeenCalledTimes(1);
    const [calledUrl, calledClientId, calledClientSecret] = client.discovery.mock.calls[0];
    // URL instances don't compare well with toHaveBeenCalledWith (no own
    // enumerable props), so assert on the parsed call args directly.
    expect(calledUrl).toBeInstanceOf(URL);
    expect(calledUrl.toString()).toBe('https://idp-basic.example.com/');
    expect(calledClientId).toBe('client-id');
    expect(calledClientSecret).toBe('client-secret');
  });

  it('returns null (not thrown) when discovery rejects, and does not memoize the failure so a second call retries', async () => {
    process.env.OIDC_ISSUER = 'https://idp-retry.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    client.discovery.mockRejectedValueOnce(new Error('network down'));
    const recoveredConfig = { fake: 'config-recovered' };
    client.discovery.mockResolvedValueOnce(recoveredConfig);

    await expect(getOidcConfig()).resolves.toBeNull();
    expect(client.discovery).toHaveBeenCalledTimes(1);

    const second = await getOidcConfig();
    expect(second).toBe(recoveredConfig);
    expect(client.discovery).toHaveBeenCalledTimes(2);
  });

  it('memoizes a successful discovery so a second call does not re-hit the network', async () => {
    process.env.OIDC_ISSUER = 'https://idp-memo.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    const resolvedConfig = { fake: 'config-memo' };
    client.discovery.mockResolvedValueOnce(resolvedConfig);

    const first = await getOidcConfig();
    const second = await getOidcConfig();

    expect(first).toBe(resolvedConfig);
    expect(second).toBe(resolvedConfig);
    expect(client.discovery).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the memo when OIDC_ISSUER changes (keyed by issuer)', async () => {
    process.env.OIDC_ISSUER = 'https://idp-issuer-a.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    const configA = { fake: 'config-a' };
    client.discovery.mockResolvedValueOnce(configA);
    const first = await getOidcConfig();
    expect(first).toBe(configA);

    process.env.OIDC_ISSUER = 'https://idp-issuer-b.example.com';
    const configB = { fake: 'config-b' };
    client.discovery.mockResolvedValueOnce(configB);
    const second = await getOidcConfig();

    expect(second).toBe(configB);
    expect(client.discovery).toHaveBeenCalledTimes(2);
  });

  it('resolves null (does not throw) when OIDC_ISSUER is not a valid URL', async () => {
    process.env.OIDC_ISSUER = 'not-a-valid-url';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';

    await expect(getOidcConfig()).resolves.toBeNull();
    expect(client.discovery).not.toHaveBeenCalled();
  });

  it('resolves null instead of hanging when discovery never settles (timeout)', async () => {
    jest.useFakeTimers();
    process.env.OIDC_ISSUER = 'https://idp-timeout.example.com';
    process.env.OIDC_CLIENT_ID = 'client-id';
    process.env.OIDC_CLIENT_SECRET = 'client-secret';
    client.discovery.mockReturnValueOnce(new Promise(() => {})); // never settles

    const pending = getOidcConfig();
    await jest.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBeNull();
  });
});

describe('buildAdminLoginUrl', () => {
  it('generates PKCE + state, stashes them on the session, and returns the built URL', async () => {
    process.env.OIDC_REDIRECT_URI = 'https://app.example.com/api/admin/oidc/callback';
    client.randomPKCECodeVerifier.mockReturnValue('verifier-abc');
    client.calculatePKCECodeChallenge.mockResolvedValue('challenge-xyz');
    client.randomState.mockReturnValue('state-123');
    const expectedUrl = new URL('https://idp.example.com/authorize?foo=bar');
    client.buildAuthorizationUrl.mockReturnValue(expectedUrl);

    const session: SessionData = {};
    const url = await buildAdminLoginUrl(mockConfig, session);

    expect(url).toBe(expectedUrl);
    expect(session.oidcVerifier).toBe('verifier-abc');
    expect(session.oidcState).toBe('state-123');
    expect(client.calculatePKCECodeChallenge).toHaveBeenCalledWith('verifier-abc');
    expect(client.buildAuthorizationUrl).toHaveBeenCalledWith(mockConfig, {
      redirect_uri: 'https://app.example.com/api/admin/oidc/callback',
      scope: 'openid email profile',
      code_challenge: 'challenge-xyz',
      code_challenge_method: 'S256',
      state: 'state-123',
    });
  });

  it('throws (does not build a URL or touch the session) when OIDC_REDIRECT_URI is unset', async () => {
    delete process.env.OIDC_REDIRECT_URI;
    const session: SessionData = {};

    await expect(buildAdminLoginUrl(mockConfig, session)).rejects.toThrow(/OIDC_REDIRECT_URI/);

    expect(client.buildAuthorizationUrl).not.toHaveBeenCalled();
    expect(session.oidcVerifier).toBeUndefined();
    expect(session.oidcState).toBeUndefined();
  });

  it('throws when OIDC_REDIRECT_URI is an empty string', async () => {
    process.env.OIDC_REDIRECT_URI = '';
    const session: SessionData = {};

    await expect(buildAdminLoginUrl(mockConfig, session)).rejects.toThrow(/OIDC_REDIRECT_URI/);
  });
});

describe('completeAdminLogin', () => {
  it('exchanges the code using the session verifier+state and returns the claims', async () => {
    const session: SessionData = { oidcVerifier: 'verifier-abc', oidcState: 'state-123' };
    const claims = { sub: 'user-1', email: 'alice@example.com', email_verified: true };
    client.authorizationCodeGrant.mockResolvedValue({ claims: () => claims });
    const currentUrl = new URL(
      'https://app.example.com/api/admin/oidc/callback?code=abc&state=state-123'
    );

    const result = await completeAdminLogin(mockConfig, currentUrl, session);

    expect(client.authorizationCodeGrant).toHaveBeenCalledWith(mockConfig, currentUrl, {
      pkceCodeVerifier: 'verifier-abc',
      expectedState: 'state-123',
    });
    expect(result).toEqual({ sub: 'user-1', email: 'alice@example.com', email_verified: true });
  });

  it('returns undefined fields when claims() returns undefined (no id_token)', async () => {
    const session: SessionData = { oidcVerifier: 'verifier-abc', oidcState: 'state-123' };
    client.authorizationCodeGrant.mockResolvedValue({ claims: () => undefined });

    const result = await completeAdminLogin(
      mockConfig,
      new URL('https://app.example.com/callback'),
      session
    );

    expect(result).toEqual({ sub: undefined, email: undefined, email_verified: undefined });
  });

  it('narrows non-standard claim types defensively instead of passing them through', async () => {
    const session: SessionData = { oidcVerifier: 'v', oidcState: 's' };
    client.authorizationCodeGrant.mockResolvedValue({
      claims: () => ({ sub: 'user-1', email: 123, email_verified: 'yes' }),
    });

    const result = await completeAdminLogin(
      mockConfig,
      new URL('https://app.example.com/callback'),
      session
    );

    expect(result).toEqual({ sub: 'user-1', email: undefined, email_verified: undefined });
  });

  it('propagates rejection from authorizationCodeGrant (e.g. state mismatch) to the caller', async () => {
    const session: SessionData = { oidcVerifier: 'v', oidcState: 's' };
    client.authorizationCodeGrant.mockRejectedValue(new Error('state mismatch'));

    await expect(
      completeAdminLogin(mockConfig, new URL('https://app.example.com/callback'), session)
    ).rejects.toThrow('state mismatch');
  });

  it('does not mutate the session - clearing oidcVerifier/oidcState is the caller\'s job', async () => {
    const session: SessionData = { oidcVerifier: 'v', oidcState: 's' };
    client.authorizationCodeGrant.mockResolvedValue({ claims: () => ({ sub: 'x' }) });

    await completeAdminLogin(mockConfig, new URL('https://app.example.com/callback'), session);

    expect(session.oidcVerifier).toBe('v');
    expect(session.oidcState).toBe('s');
  });
});
