import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mock setup for routes that import `prisma` from '@/lib/db'
// ---------------------------------------------------------------------------
const mockPrismaDb = {
  group: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  person: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  wishlistItem: {
    deleteMany: jest.fn(),
    create: jest.fn(),
  },
  assignment: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  adminConfig: {
    findUnique: jest.fn(),
  },
  block: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  forcedPin: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
  round: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  suggestion: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrismaDb,
}));

// ---------------------------------------------------------------------------
// Mock setup for routes that create their own PrismaClient
// ---------------------------------------------------------------------------
const mockPrismaOwn = {
  group: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  person: {
    findUnique: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@/app/generated/prisma', () => ({
  PrismaClient: jest.fn(() => mockPrismaOwn),
}));

// ---------------------------------------------------------------------------
// Mock setup for @/lib/session - a controllable session object shared across
// every route under test. Routes call `getSession()`/`getSessionFromRequest()`
// at the very top of their handlers; without this mock, the real iron-session
// implementation calls `next/headers` `cookies()`, which throws outside a real
// request scope ("cookies() was called outside a request scope") and every
// such route 500s before its own logic ever runs. Individual tests set the
// fields they need (isAdmin/adminGroupId, isLoggedIn/personId/groupId, etc.);
// the beforeEach below clears everything back to a logged-out session except
// the two jest.fn spies themselves.
// ---------------------------------------------------------------------------
const mockSession: Record<string, unknown> & { save: jest.Mock; destroy: jest.Mock } = {
  save: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(async () => mockSession),
  getSessionFromRequest: jest.fn(async () => mockSession),
  cookieSecure: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Mock bcryptjs
// ---------------------------------------------------------------------------
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: {
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Mock @/lib/utils
// ---------------------------------------------------------------------------
jest.mock('@/lib/utils', () => ({
  generateGroupInviteCode: jest.fn().mockReturnValue('ABC123'),
  generatePersonalLinkToken: jest.fn().mockReturnValue('tok_test'),
  validateWishlistItems: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/email
// ---------------------------------------------------------------------------
jest.mock('@/lib/email', () => ({
  sendLoginLinkEmail: jest.fn().mockResolvedValue(true),
  sendMatchReadyEmail: jest.fn().mockResolvedValue(true),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/secret-santa
// ---------------------------------------------------------------------------
jest.mock('@/lib/secret-santa', () => ({
  generateDraw: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/rounds (ensureRound, getActiveYear) so pin/generate/send/
// assignments/person-data tests control the round and active year directly.
// Every export lib/rounds.ts has MUST be listed here - a route importing an
// export this mock omits gets `undefined` back and 500s before its own logic
// ever runs. The real ensureRound/getActiveYear logic is exercised separately
// in __tests__/lib/rounds.test.ts, which mocks '@/lib/db' instead of this module.
// ---------------------------------------------------------------------------
jest.mock('@/lib/rounds', () => ({
  ensureRound: jest.fn(),
  getActiveYear: jest.fn(),
  getPreviousYearExclusions: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import bcrypt from 'bcryptjs';
import { ensureRound, getActiveYear, getPreviousYearExclusions } from '@/lib/rounds';
import { generateGroupInviteCode, generatePersonalLinkToken, validateWishlistItems } from '@/lib/utils';
import { sendLoginLinkEmail, sendMatchReadyEmail } from '@/lib/email';
import { generateDraw } from '@/lib/secret-santa';

import { POST as createGroup } from '@/app/api/groups/create/route';
import { POST as verifyGroup } from '@/app/api/groups/verify/route';
import { GET as getGroup, PATCH as patchGroup } from '@/app/api/groups/[id]/route';
import { GET as personalLinkLogin } from '@/app/p/[token]/route';
import { POST as emailLink } from '@/app/api/auth/email-link/route';
import { GET as getPeople, POST as createPerson } from '@/app/api/people/route';
import { DELETE as deletePerson, PATCH as patchPerson } from '@/app/api/people/[id]/route';
import { GET as personData } from '@/app/api/auth/person-data/route';
import { POST as updateWishlist } from '@/app/api/wishlist/route';
import { GET as getAssignments, DELETE as deleteAssignments } from '@/app/api/assignments/route';
import { POST as adminAuth } from '@/app/api/admin/auth/route';
import { POST as createBlock, DELETE as deleteBlock } from '@/app/api/blocks/route';
import { POST as createPin, DELETE as deletePin } from '@/app/api/pins/route';
import { POST as generateRound } from '@/app/api/rounds/generate/route';
import { POST as sendRound } from '@/app/api/rounds/send/route';
import { POST as rolloverRound } from '@/app/api/rounds/rollover/route';
import { POST as seedRound } from '@/app/api/rounds/seed/route';
import { GET as getRoster } from '@/app/api/roster/route';
import { POST as createSuggestion, GET as getSuggestions, DELETE as deleteSuggestion } from '@/app/api/suggestions/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePostRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function makeDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

function makePatchRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Reset all mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  // Reset the shared session back to logged-out, keeping the save/destroy spies.
  for (const k of Object.keys(mockSession)) {
    if (k !== 'save' && k !== 'destroy') delete mockSession[k];
  }
});

// ===========================================================================
// 1. POST /api/groups/create
// ===========================================================================
describe('POST /api/groups/create', () => {
  const url = 'http://localhost:3000/api/groups/create';

  it('returns 400 when group name is missing', async () => {
    const req = makePostRequest(url, { groupName: '', adminPassword: 'password123' });
    const res = await createGroup(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group name is required');
  });

  it('returns 400 when admin password is too short', async () => {
    // lib/password.ts's validatePassword() requires 12+ chars (with upper/lower/digit);
    // this test predates that policy and asserted the old 6-char message. Corrected to
    // match the password policy the route has actually enforced all along.
    const req = makePostRequest(url, { groupName: 'Test Group', adminPassword: '12345' });
    const res = await createGroup(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Password must be at least 12 characters long');
  });

  it('returns 201 on successful group creation', async () => {
    mockPrismaDb.group.findUnique.mockResolvedValue(null); // invite code doesn't exist
    mockPrismaDb.group.create.mockResolvedValue({
      id: 'group-1',
      name: 'Test Group',
      inviteCode: 'ABC123',
      year: 2026,
      adminConfig: { id: 'ac-1', hashedPassword: 'hashed-password', groupId: 'group-1' },
    });

    // Must satisfy validatePassword(): 12+ chars, upper + lower + digit.
    const req = makePostRequest(url, { groupName: 'Test Group', adminPassword: 'Password1234' });
    const res = await createGroup(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.group).toEqual({
      id: 'group-1',
      name: 'Test Group',
      inviteCode: 'ABC123',
      year: 2026,
    });

    expect(generateGroupInviteCode).toHaveBeenCalled();
    expect(bcrypt.hash).toHaveBeenCalledWith('Password1234', 12);
    expect(mockPrismaDb.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Test Group', inviteCode: 'ABC123' }),
      }),
    );
  });
});

// ===========================================================================
// 2. POST /api/groups/verify
// ===========================================================================
describe('POST /api/groups/verify', () => {
  const url = 'http://localhost:3000/api/groups/verify';

  it('returns 400 when invite code is missing', async () => {
    const req = makePostRequest(url, {});
    const res = await verifyGroup(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invite code is required');
  });

  it('returns 404 when invite code is invalid', async () => {
    mockPrismaDb.group.findUnique.mockResolvedValue(null);

    const req = makePostRequest(url, { inviteCode: 'WRONG1' });
    const res = await verifyGroup(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Invalid invite code');
  });

  it('returns 200 with group data for valid invite code', async () => {
    const groupData = { id: 'group-1', name: 'Test', inviteCode: 'ABC123', year: 2026 };
    mockPrismaDb.group.findUnique.mockResolvedValue(groupData);

    const req = makePostRequest(url, { inviteCode: 'abc123' });
    const res = await verifyGroup(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.group).toEqual(groupData);

    // Verify case-insensitive lookup
    expect(mockPrismaDb.group.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { inviteCode: 'ABC123' } }),
    );
  });
});

// ===========================================================================
// 3. GET /api/groups/[id]
// ===========================================================================
describe('GET /api/groups/[id]', () => {
  // Note: this route imports `prisma` from '@/lib/db' (mockPrismaDb), not its own
  // PrismaClient - these tests previously drove the unused `mockPrismaOwn` mock, which
  // never reached the real route (it always saw an unmocked, undefined-returning
  // findUnique). Corrected to use mockPrismaDb, which the route actually calls.
  it('returns 404 when group is not found', async () => {
    mockSession.groupId = 'nonexistent';
    mockPrismaDb.group.findUnique.mockResolvedValue(null);

    const req = makeGetRequest('http://localhost:3000/api/groups/nonexistent');
    const res = await getGroup(req, { params: { id: 'nonexistent' } } as any);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Group not found');
  });

  it('returns 200 with group data for valid id', async () => {
    mockSession.groupId = 'group-1';
    const groupData = {
      id: 'group-1',
      name: 'Test',
      inviteCode: 'ABC123',
      year: 2026,
      _count: { people: 5, assignments: 5 },
    };
    mockPrismaDb.group.findUnique.mockResolvedValue(groupData);

    const req = makeGetRequest('http://localhost:3000/api/groups/group-1');
    const res = await getGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.group).toEqual(groupData);
  });
});

// ===========================================================================
// 4. PATCH /api/groups/[id]
// ===========================================================================
describe('PATCH /api/groups/[id]', () => {
  // Same mockPrismaOwn->mockPrismaDb correction as GET /api/groups/[id] above, plus an
  // admin session (this route 403s up front unless session.isAdmin && adminGroupId matches).
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 for invalid currency code', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      budgetAmount: 50,
      budgetCurrency: 'INVALID',
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid currency code');
  });

  it('returns 400 for negative budget amount', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      budgetAmount: -10,
      budgetCurrency: 'USD',
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Budget amount must be a positive number');
  });

  it('returns 200 on valid budget update', async () => {
    const updatedGroup = {
      id: 'group-1',
      name: 'Test',
      budgetAmount: 50,
      budgetCurrency: 'EUR',
    };
    mockPrismaDb.group.update.mockResolvedValue(updatedGroup);

    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      budgetAmount: 50,
      budgetCurrency: 'EUR',
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.group).toEqual(updatedGroup);
  });

  it('accepts and persists suggestionCap and previousYearMemory when both are provided', async () => {
    const updatedGroup = {
      id: 'group-1',
      name: 'Test',
      suggestionCap: 0,
      previousYearMemory: 10,
    };
    mockPrismaDb.group.update.mockResolvedValue(updatedGroup);

    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      suggestionCap: 0,
      previousYearMemory: 10,
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);

    expect(res.status).toBe(200);
    expect(mockPrismaDb.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'group-1' },
        data: expect.objectContaining({
          suggestionCap: 0,
          previousYearMemory: 10,
        }),
      }),
    );
  });

  it('returns 400 for a suggestionCap above the allowed range', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      suggestionCap: 11,
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    expect(mockPrismaDb.group.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-integer suggestionCap', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      suggestionCap: 2.5,
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    expect(mockPrismaDb.group.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range previousYearMemory', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      previousYearMemory: -1,
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    expect(mockPrismaDb.group.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-integer previousYearMemory', async () => {
    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      previousYearMemory: 1.5,
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);
    expect(res.status).toBe(400);
    expect(mockPrismaDb.group.update).not.toHaveBeenCalled();
  });

  it('omits suggestionCap and previousYearMemory from the update data when not provided (budget-only PATCH unaffected)', async () => {
    const updatedGroup = {
      id: 'group-1',
      name: 'Test',
      budgetAmount: 50,
      budgetCurrency: 'EUR',
    };
    mockPrismaDb.group.update.mockResolvedValue(updatedGroup);

    const req = makePatchRequest('http://localhost:3000/api/groups/group-1', {
      budgetAmount: 50,
      budgetCurrency: 'EUR',
    });
    const res = await patchGroup(req, { params: { id: 'group-1' } } as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.group).toEqual(updatedGroup);

    const updateCall = mockPrismaDb.group.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('suggestionCap');
    expect(updateCall.data).not.toHaveProperty('previousYearMemory');
    expect(updateCall.data.budgetAmount).toBe(50);
    expect(updateCall.data.budgetCurrency).toBe('EUR');
  });
});

// ===========================================================================
// 5. GET /p/[token]
// durable personal-link login (Task 6). Replaces the old login-code POST -
// visiting this URL is the only way in; a hit sets the session and redirects
// straight to /wishlist, a miss bounces to /login?error=invalid-link.
// ===========================================================================
describe('GET /p/[token]', () => {
  const makeParams = (token: string) => ({ params: { token } });

  it('sets session fields and redirects to /wishlist for a valid active token', async () => {
    const personData = {
      id: 'person-1',
      name: 'Alice',
      groupId: 'group-1',
      personalLinkToken: 'tok_abc123',
      active: true,
      group: { id: 'group-1', name: 'Test Group' },
    };
    mockPrismaDb.person.findFirst.mockResolvedValue(personData);

    const req = makeGetRequest('http://localhost:3000/p/tok_abc123');
    const res = await personalLinkLogin(req, makeParams('tok_abc123') as any);

    expect(mockPrismaDb.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personalLinkToken: 'tok_abc123', active: true },
      }),
    );

    expect(mockSession.personId).toBe('person-1');
    expect(mockSession.personName).toBe('Alice');
    expect(mockSession.groupId).toBe('group-1');
    expect(mockSession.groupName).toBe('Test Group');
    expect(mockSession.loginMethod).toBe('link');
    expect(mockSession.isLoggedIn).toBe(true);
    expect(mockSession.save).toHaveBeenCalled();

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/wishlist');
  });

  it('redirects to /login?error=invalid-link when the token has no active match', async () => {
    mockPrismaDb.person.findFirst.mockResolvedValue(null);

    const req = makeGetRequest('http://localhost:3000/p/does-not-exist');
    const res = await personalLinkLogin(req, makeParams('does-not-exist') as any);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login?error=invalid-link');
    expect(mockSession.save).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 6. POST /api/auth/email-link
// self-service resend of a person's durable /p/<token> link (Task 6). Replaces
// the old ephemeral magic-link POST - always answers with the same generic
// message so the response never reveals whether the email is registered.
// ===========================================================================
describe('POST /api/auth/email-link', () => {
  const url = 'http://localhost:3000/api/auth/email-link';

  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
  });

  it('returns 400 when fields are missing', async () => {
    const req = makePostRequest(url, { email: 'test@example.com' });
    const res = await emailLink(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Email and group ID are required');
  });

  it('returns the generic message and does not email when the person is not found (security)', async () => {
    mockPrismaDb.person.findFirst.mockResolvedValue(null);

    const req = new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ email: 'unknown@example.com', groupId: 'group-1' }),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.1' },
    });
    const res = await emailLink(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('If this email is registered, a login link has been sent.');
    expect(sendLoginLinkEmail).not.toHaveBeenCalled();
  });

  it('returns the same generic message and emails the durable link for a known active person', async () => {
    const personData = {
      id: 'person-1',
      name: 'Alice',
      email: 'alice@example.com',
      groupId: 'group-1',
      personalLinkToken: 'tok_abc123',
      active: true,
      group: { id: 'group-1', name: 'Test Group' },
    };
    mockPrismaDb.person.findFirst.mockResolvedValue(personData);

    const req = new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ email: 'Alice@Example.com', groupId: 'group-1' }),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.2' },
    });
    const res = await emailLink(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('If this email is registered, a login link has been sent.');

    // Verify case-insensitive lookup
    expect(mockPrismaDb.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', email: 'alice@example.com', active: true },
      }),
    );
    expect(sendLoginLinkEmail).toHaveBeenCalledWith(
      'alice@example.com',
      'Alice',
      'Test Group',
      expect.stringContaining('/p/tok_abc123'),
    );
  });

  it('returns the generic message even when the email send fails (no enumeration)', async () => {
    const personData = {
      id: 'person-1',
      name: 'Alice',
      email: 'alice@example.com',
      groupId: 'group-1',
      personalLinkToken: 'tok_abc123',
      active: true,
      group: { id: 'group-1', name: 'Test Group' },
    };
    mockPrismaDb.person.findFirst.mockResolvedValue(personData);
    (sendLoginLinkEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));

    const req = new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.com', groupId: 'group-1' }),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '10.0.1.3' },
    });
    const res = await emailLink(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe('If this email is registered, a login link has been sent.');
  });

  it('returns 429 once the rate limit is exceeded', async () => {
    mockPrismaDb.person.findFirst.mockResolvedValue(null);
    const ip = '10.0.1.99';
    const makeRateLimitedReq = () => new NextRequest(url, {
      method: 'POST',
      body: JSON.stringify({ email: 'alice@example.com', groupId: 'group-1' }),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    });

    for (let i = 0; i < 5; i++) {
      const res = await emailLink(makeRateLimitedReq());
      expect(res.status).toBe(200);
    }

    const res = await emailLink(makeRateLimitedReq());
    expect(res.status).toBe(429);
  });
});

// ===========================================================================
// 7. GET /api/people
// ===========================================================================
describe('GET /api/people', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makeGetRequest('http://localhost:3000/api/people');
    const res = await getPeople(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 200 with list of people for the group admin', async () => {
    const people = [
      { id: 'p-1', name: 'Alice', wishlistItems: [], _count: { wishlistItems: 0 } },
      { id: 'p-2', name: 'Bob', wishlistItems: [], _count: { wishlistItems: 0 } },
    ];
    mockPrismaDb.person.findMany.mockResolvedValue(people);

    const req = makeGetRequest('http://localhost:3000/api/people?groupId=group-1');
    const res = await getPeople(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.people).toEqual(people);
    expect(mockPrismaDb.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1' } }),
    );
  });

  it('forbids a participant listing people (would leak durable login tokens)', async () => {
    delete mockSession.isAdmin;
    delete mockSession.adminGroupId;
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    const res = await getPeople(makeGetRequest('http://localhost:3000/api/people?groupId=group-1'));
    expect(res.status).toBe(403);
    // must NOT have queried the roster - no token exposure
    expect(mockPrismaDb.person.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 9. POST /api/people
// ===========================================================================
describe('POST /api/people', () => {
  const url = 'http://localhost:3000/api/people';

  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when name is missing', async () => {
    const req = makePostRequest(url, { name: '', groupId: 'group-1' });
    const res = await createPerson(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Name is required');
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makePostRequest(url, { name: 'Alice' });
    const res = await createPerson(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 400 when email is already used in the group', async () => {
    mockPrismaDb.person.findFirst.mockResolvedValue({ id: 'existing-person' });

    const req = makePostRequest(url, {
      name: 'Alice',
      email: 'alice@example.com',
      groupId: 'group-1',
    });
    const res = await createPerson(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Email is already used in this group');
  });

  it('returns 201 on successful creation', async () => {
    // No duplicate email
    mockPrismaDb.person.findFirst.mockResolvedValue(null);
    const personData = {
      id: 'person-1',
      name: 'Alice',
      email: 'alice@example.com',
      personalLinkToken: 'tok_test',
      groupId: 'group-1',
    };
    mockPrismaDb.person.create.mockResolvedValue(personData);

    const req = makePostRequest(url, {
      name: 'Alice',
      email: 'alice@example.com',
      groupId: 'group-1',
    });
    const res = await createPerson(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.person).toEqual(personData);
    expect(generatePersonalLinkToken).toHaveBeenCalled();
    expect(mockPrismaDb.person.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ personalLinkToken: 'tok_test' }),
      }),
    );
  });
});

// ===========================================================================
// 10. DELETE /api/people/[id]
// ===========================================================================
describe('DELETE /api/people/[id]', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 200 on successful delete', async () => {
    // The route looks the person up (and checks group ownership) before deleting -
    // this was previously masked by the getSession() crash, so the mock was never needed.
    mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'person-1', groupId: 'group-1' });
    mockPrismaDb.person.delete.mockResolvedValue({ id: 'person-1' });

    const req = makeDeleteRequest('http://localhost:3000/api/people/person-1');
    const res = await deletePerson(req, { params: { id: 'person-1' } } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockPrismaDb.person.delete).toHaveBeenCalledWith({ where: { id: 'person-1' } });
  });

  it('returns 500 on error', async () => {
    mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'nonexistent', groupId: 'group-1' });
    mockPrismaDb.person.delete.mockRejectedValue(new Error('DB error'));

    const req = makeDeleteRequest('http://localhost:3000/api/people/nonexistent');
    const res = await deletePerson(req, { params: { id: 'nonexistent' } } as any);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Internal server error');
  });
});

// ===========================================================================
// 10b. PATCH /api/people/[id] (new: admin-gated active toggle)
// ===========================================================================
describe('PATCH /api/people/[id]', () => {
  const url = 'http://localhost:3000/api/people/person-1';

  it('returns 403 when not admin', async () => {
    const req = makePatchRequest(url, { active: false });
    const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Admin authentication required');
  });

  describe('as admin', () => {
    beforeEach(() => {
      mockSession.isAdmin = true;
      mockSession.adminGroupId = 'group-1';
    });

    it('returns 400 when neither a boolean active nor rotateLink is given', async () => {
      const req = makePatchRequest(url, { active: 'nope' });
      const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/active.*rotateLink/i);
    });

    it('returns 404 when person is not found', async () => {
      mockPrismaDb.person.findUnique.mockResolvedValue(null);

      const req = makePatchRequest(url, { active: false });
      const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Person not found');
    });

    it('returns 403 when person belongs to a different group', async () => {
      mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'person-1', groupId: 'other-group' });

      const req = makePatchRequest(url, { active: false });
      const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Forbidden');
    });

    it('returns 200 and flips active', async () => {
      mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'person-1', groupId: 'group-1', active: true });
      mockPrismaDb.person.update.mockResolvedValue({ id: 'person-1', groupId: 'group-1', active: false });

      const req = makePatchRequest(url, { active: false });
      const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.person.active).toBe(false);
      expect(mockPrismaDb.person.update).toHaveBeenCalledWith({
        where: { id: 'person-1' },
        data: { active: false },
      });
    });
  });
});

// ===========================================================================
// 11. POST /api/wishlist
// ===========================================================================
describe('POST /api/wishlist', () => {
  const url = 'http://localhost:3000/api/wishlist';

  // The route requires a logged-in participant session and checks ownership
  // (`personId !== session.personId` -> 403) before any body validation, so every
  // test needs a session whose personId matches the person it's exercising.
  beforeEach(() => {
    mockSession.isLoggedIn = true;
    mockSession.personId = 'person-1';
    mockSession.groupId = 'group-1';
  });

  it('returns 403 when personId is missing (ownership check runs before presence check)', async () => {
    // GUARD-ORDER: the route checks `personId !== session.personId` (403) before
    // `!personId` (400), so an absent personId never reaches the "required" branch -
    // it fails ownership first, since undefined !== 'person-1'.
    const req = makePostRequest(url, { items: [] });
    const res = await updateWishlist(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden: you can only modify your own wishlist');
  });

  it('returns 400 when items is not an array', async () => {
    const req = makePostRequest(url, { personId: 'person-1', items: 'not-array' });
    const res = await updateWishlist(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Items must be an array');
  });

  it('returns 400 when wishlist items fail validation', async () => {
    (validateWishlistItems as jest.Mock).mockReturnValue({
      valid: false,
      error: 'All items must have a title',
    });

    const req = makePostRequest(url, {
      personId: 'person-1',
      items: [{ title: '', note: 'http://example.com' }],
    });
    const res = await updateWishlist(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('All items must have a title');
  });

  it('returns 404 when person is not found', async () => {
    (validateWishlistItems as jest.Mock).mockReturnValue({ valid: true });
    mockPrismaDb.person.findUnique.mockResolvedValue(null);

    const req = makePostRequest(url, {
      personId: 'person-1',
      items: [{ title: 'Gift', note: 'http://example.com' }],
    });
    const res = await updateWishlist(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Person not found');
  });

  it('returns 200 on valid wishlist update', async () => {
    (validateWishlistItems as jest.Mock).mockReturnValue({ valid: true });
    mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'person-1', groupId: 'group-1' });
    mockPrismaDb.wishlistItem.deleteMany.mockResolvedValue({ count: 0 });
    const createdItem = {
      id: 'wi-1',
      personId: 'person-1',
      title: 'Cool Gift',
      note: 'http://example.com/gift',
      order: 0,
    };
    mockPrismaDb.wishlistItem.create.mockResolvedValue(createdItem);

    const req = makePostRequest(url, {
      personId: 'person-1',
      items: [{ title: 'Cool Gift', note: 'http://example.com/gift' }],
    });
    const res = await updateWishlist(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.wishlistItems).toEqual([createdItem]);

    expect(mockPrismaDb.wishlistItem.deleteMany).toHaveBeenCalledWith({
      where: { personId: 'person-1' },
    });
    expect(mockPrismaDb.wishlistItem.create).toHaveBeenCalledWith({
      data: {
        personId: 'person-1',
        title: 'Cool Gift',
        note: 'http://example.com/gift',
        order: 0,
      },
    });
  });
});

// ===========================================================================
// 13. GET /api/assignments
// ===========================================================================
describe('GET /api/assignments', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makeGetRequest('http://localhost:3000/api/assignments');
    const res = await getAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 200 with assignments, defaulting to the active year', async () => {
    const assignments = [
      {
        id: 'a-1',
        giverId: 'p-1',
        receiverId: 'p-2',
        giver: { id: 'p-1', name: 'Alice' },
        receiver: { id: 'p-2', name: 'Bob', wishlistItems: [] },
      },
    ];
    mockPrismaDb.assignment.findMany.mockResolvedValue(assignments);

    const req = makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1');
    const res = await getAssignments(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assignments).toEqual(assignments);
    expect(getActiveYear).toHaveBeenCalledWith('group-1');
    expect(mockPrismaDb.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', year: 2026 } })
    );
  });

  it('admin can view a past year via ?year= (history view) without consulting the active year', async () => {
    mockPrismaDb.assignment.findMany.mockResolvedValue([]);

    const req = makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1&year=2024');
    const res = await getAssignments(req);
    expect(res.status).toBe(200);
    expect(mockPrismaDb.assignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', year: 2024 } })
    );
    // explicit year short-circuits - the active-year lookup is never needed
    expect(getActiveYear).not.toHaveBeenCalled();
  });

  it('participant sees only their OWN match and only once sent', async () => {
    delete mockSession.isAdmin;
    delete mockSession.adminGroupId;
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    mockPrismaDb.assignment.findFirst.mockResolvedValue({
      id: 'a-1',
      giverId: 'p-1',
      receiver: { id: 'p-2', name: 'Bob', wishlistItems: [] },
      round: { status: 'sent' },
    });
    const res = await getAssignments(makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ready).toBe(true);
    expect(json.assignment.giverId).toBe('p-1');
    // scoped to the caller only, never the whole table, and always the active year
    expect(mockPrismaDb.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ giverId: 'p-1', year: 2026 }) })
    );
    expect(mockPrismaDb.assignment.findMany).not.toHaveBeenCalled();
  });

  it('participant always gets the active year, ignoring any client-supplied ?year=', async () => {
    delete mockSession.isAdmin;
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    mockPrismaDb.assignment.findFirst.mockResolvedValue(null);

    await getAssignments(makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1&year=1999'));
    expect(mockPrismaDb.assignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ year: 2026 }) })
    );
  });

  it('participant sees nothing before the round is sent', async () => {
    delete mockSession.isAdmin;
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    mockPrismaDb.assignment.findFirst.mockResolvedValue({ id: 'a-1', giverId: 'p-1', round: { status: 'generated' } });
    const res = await getAssignments(makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ready).toBe(false);
    expect(json.assignment).toBeNull();
  });

  it('forbids a participant querying another group', async () => {
    delete mockSession.isAdmin;
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-9';
    mockSession.groupId = 'other-group';
    const res = await getAssignments(makeGetRequest('http://localhost:3000/api/assignments?groupId=group-1'));
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 14. DELETE /api/assignments
// ===========================================================================
describe('DELETE /api/assignments', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makeDeleteRequest('http://localhost:3000/api/assignments');
    const res = await deleteAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('deletes assignments AND resets the round to draft (avoids stranding a sent round)', async () => {
    mockPrismaDb.assignment.deleteMany.mockResolvedValue({ count: 3 });
    mockPrismaDb.$transaction.mockResolvedValue([]);

    const req = makeDeleteRequest('http://localhost:3000/api/assignments?groupId=group-1');
    const res = await deleteAssignments(req);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    // the round must be reset so a post-send delete doesn't brick regeneration
    expect(mockPrismaDb.round.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { groupId: 'group-1', year: 2026 }, data: { status: 'draft', sentAt: null } })
    );
    expect(mockPrismaDb.assignment.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', year: 2026 },
    });
  });

  it('ignores a client-supplied ?year= and deletes the active year only', async () => {
    mockPrismaDb.assignment.deleteMany.mockResolvedValue({ count: 1 });
    mockPrismaDb.$transaction.mockResolvedValue([]);

    const req = makeDeleteRequest('http://localhost:3000/api/assignments?groupId=group-1&year=1999');
    await deleteAssignments(req);
    expect(mockPrismaDb.assignment.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', year: 2026 },
    });
  });
});

// ===========================================================================
// 15. POST /api/admin/auth
// ===========================================================================
describe('POST /api/admin/auth', () => {
  const url = 'http://localhost:3000/api/admin/auth';

  it('returns 400 when password is missing', async () => {
    const req = makePostRequest(url, { groupId: 'group-1' });
    const res = await adminAuth(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Password is required');
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makePostRequest(url, { password: 'secret123' });
    const res = await adminAuth(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 401 when group is not found (enumeration-safe: same message as wrong password)', async () => {
    // The route intentionally returns the same 401 "Invalid credentials" whether the
    // group/adminConfig doesn't exist or the password is wrong, to avoid leaking which
    // one was the problem (see the route's "prevent enumeration" comment). This test
    // predates that and expected a distinguishing 404 - corrected to match.
    mockPrismaDb.adminConfig.findUnique.mockResolvedValue(null);

    const req = makePostRequest(url, { password: 'secret123', groupId: 'nonexistent' });
    const res = await adminAuth(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid credentials');
  });

  it('returns 401 when password is wrong', async () => {
    mockPrismaDb.adminConfig.findUnique.mockResolvedValue({
      id: 'ac-1',
      hashedPassword: 'hashed-password',
      groupId: 'group-1',
      group: { id: 'group-1', name: 'Test', inviteCode: 'ABC123', year: 2026 },
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    const req = makePostRequest(url, { password: 'wrongpassword', groupId: 'group-1' });
    const res = await adminAuth(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Invalid credentials');
  });

  it('returns 200 on valid admin authentication', async () => {
    const adminConfig = {
      id: 'ac-1',
      hashedPassword: 'hashed-password',
      groupId: 'group-1',
      group: { id: 'group-1', name: 'Test Group', inviteCode: 'ABC123', year: 2026 },
    };
    mockPrismaDb.adminConfig.findUnique.mockResolvedValue(adminConfig);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const req = makePostRequest(url, { password: 'correct-password', groupId: 'group-1' });
    const res = await adminAuth(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.group).toEqual({
      id: 'group-1',
      name: 'Test Group',
      inviteCode: 'ABC123',
      year: 2026,
    });
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', 'hashed-password');
  });
});

// ===========================================================================
// POST/DELETE /api/blocks
// ===========================================================================
describe('/api/blocks', () => {
  const url = 'http://localhost:3000/api/blocks';
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when fields are missing', async () => {
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1', personAId: 'a', personBId: 'b' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the admin does not own the group', async () => {
    mockSession.adminGroupId = 'other-group';
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1', personAId: 'a', personBId: 'b' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for a self-block', async () => {
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1', personAId: 'a', personBId: 'a' }));
    expect(res.status).toBe(400);
  });

  it('normalises pair order and creates a block (201)', async () => {
    mockPrismaDb.block.findFirst.mockResolvedValue(null);
    mockPrismaDb.block.create.mockResolvedValue({ id: 'blk-1' });
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1', personAId: 'z', personBId: 'a' }));
    expect(res.status).toBe(201);
    expect(mockPrismaDb.block.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', personAId: 'a', personBId: 'z' },
    });
  });

  it('dedupes an existing block instead of duplicating', async () => {
    mockPrismaDb.block.findFirst.mockResolvedValue({ id: 'blk-existing' });
    const res = await createBlock(makePostRequest(url, { groupId: 'group-1', personAId: 'a', personBId: 'b' }));
    expect(res.status).toBe(200);
    expect(mockPrismaDb.block.create).not.toHaveBeenCalled();
  });

  it('deletes a block by id for the owning admin', async () => {
    mockPrismaDb.block.findUnique.mockResolvedValue({ id: 'blk-1', groupId: 'group-1' });
    mockPrismaDb.block.delete.mockResolvedValue({ id: 'blk-1' });
    const res = await deleteBlock(makeDeleteRequest(url + '?id=blk-1'));
    expect(res.status).toBe(200);
  });

  it('returns 404 deleting a missing block', async () => {
    mockPrismaDb.block.findUnique.mockResolvedValue(null);
    const res = await deleteBlock(makeDeleteRequest(url + '?id=nope'));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST/DELETE /api/pins
// ===========================================================================
describe('/api/pins', () => {
  const url = 'http://localhost:3000/api/pins';
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (ensureRound as jest.Mock).mockResolvedValue({ id: 'round-1', groupId: 'group-1', year: 2026, status: 'draft' });
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
  });

  it('returns 400 when fields are missing', async () => {
    const res = await createPin(makePostRequest(url, { groupId: 'group-1', year: 2026 }));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    const res = await createPin(makePostRequest(url, { groupId: 'group-1', year: 2026, giverId: 'g', receiverId: 'r' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 for a self-pin', async () => {
    const res = await createPin(makePostRequest(url, { groupId: 'group-1', year: 2026, giverId: 'g', receiverId: 'g' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the round is already sent', async () => {
    (ensureRound as jest.Mock).mockResolvedValue({ id: 'round-1', groupId: 'group-1', status: 'sent' });
    const res = await createPin(makePostRequest(url, { groupId: 'group-1', year: 2026, giverId: 'g', receiverId: 'r' }));
    expect(res.status).toBe(400);
  });

  it('upserts a pin keyed by (round, giver) (201)', async () => {
    mockPrismaDb.forcedPin.upsert.mockResolvedValue({ id: 'pin-1' });
    const res = await createPin(makePostRequest(url, { groupId: 'group-1', year: 2026, giverId: 'g', receiverId: 'r' }));
    expect(res.status).toBe(201);
    expect(mockPrismaDb.forcedPin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId_giverId: { roundId: 'round-1', giverId: 'g' } } })
    );
  });

  it('deletes a pin by id for the owning admin on an unsent round', async () => {
    mockPrismaDb.forcedPin.findUnique.mockResolvedValue({ id: 'pin-1', round: { groupId: 'group-1', status: 'draft' } });
    mockPrismaDb.forcedPin.delete.mockResolvedValue({ id: 'pin-1' });
    const res = await deletePin(makeDeleteRequest(url + '?id=pin-1'));
    expect(res.status).toBe(200);
  });

  it('ignores a client-supplied year and resolves the active year server-side', async () => {
    mockPrismaDb.forcedPin.upsert.mockResolvedValue({ id: 'pin-1' });

    // A client trying to sneak a different year in the body must not affect
    // which round the pin lands on - only Group.year (via getActiveYear) does.
    await createPin(makePostRequest(url, { groupId: 'group-1', year: 1999, giverId: 'g', receiverId: 'r' }));
    expect(ensureRound).toHaveBeenCalledWith('group-1', 2026);
  });
});

// ===========================================================================
// POST /api/rounds/generate
// ===========================================================================
describe('POST /api/rounds/generate', () => {
  const url = 'http://localhost:3000/api/rounds/generate';
  const threePeople = [
    { id: 'p-1', name: 'Alice' },
    { id: 'p-2', name: 'Bob' },
    { id: 'p-3', name: 'Cara' },
  ];
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (ensureRound as jest.Mock).mockResolvedValue({ id: 'round-1', groupId: 'group-1', year: 2026, status: 'draft' });
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    (getPreviousYearExclusions as jest.Mock).mockResolvedValue([]);
    mockPrismaDb.block.findMany.mockResolvedValue([]);
    mockPrismaDb.forcedPin.findMany.mockResolvedValue([]);
    mockPrismaDb.group.findUnique.mockResolvedValue({ previousYearMemory: 1 });
  });

  it('returns 400 when groupId is missing', async () => {
    const res = await generateRound(makePostRequest(url, {}));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    const res = await generateRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(403);
  });

  it('refuses to regenerate a sent round', async () => {
    (ensureRound as jest.Mock).mockResolvedValue({ id: 'round-1', status: 'sent' });
    const res = await generateRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already been sent/i);
  });

  it('returns 400 with fewer than 3 active people', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue([{ id: 'p-1', name: 'Alice' }, { id: 'p-2', name: 'Bob' }]);
    const res = await generateRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(400);
  });

  it('surfaces infeasibility and does NOT flip the round', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue(threePeople);
    (generateDraw as jest.Mock).mockReturnValue({ ok: false, reason: 'No valid draw is possible under the current rules.' });
    const res = await generateRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no valid draw/i);
    expect(mockPrismaDb.$transaction).not.toHaveBeenCalled();
    expect(mockPrismaDb.round.update).not.toHaveBeenCalled();
  });

  it('persists the draw and flips the round to generated on success', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue(threePeople);
    (generateDraw as jest.Mock).mockReturnValue({
      ok: true,
      assignments: [
        { giverId: 'p-1', receiverId: 'p-2' },
        { giverId: 'p-2', receiverId: 'p-3' },
        { giverId: 'p-3', receiverId: 'p-1' },
      ],
    });
    mockPrismaDb.$transaction.mockResolvedValue([]);
    const named = [{ id: 'a-1', giver: { name: 'Alice' }, receiver: { name: 'Bob' } }];
    mockPrismaDb.assignment.findMany.mockResolvedValue(named);

    const res = await generateRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('generated');
    expect(json.assignments).toEqual(named);
    expect(mockPrismaDb.$transaction).toHaveBeenCalled();
    expect(mockPrismaDb.round.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'round-1' }, data: { status: 'generated' } })
    );
    // the round and every persisted assignment used the server-resolved active year
    expect(ensureRound).toHaveBeenCalledWith('group-1', 2026);
    expect(mockPrismaDb.assignment.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', year: 2026 },
    });
    expect(mockPrismaDb.assignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ year: 2026 }) })
    );
  });

  it('feeds generateDraw the previous-year exclusions for the resolved memory depth', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue(threePeople);
    mockPrismaDb.group.findUnique.mockResolvedValue({ previousYearMemory: 2 });
    const exclusions = [{ giverId: 'p-1', receiverId: 'p-2' }];
    (getPreviousYearExclusions as jest.Mock).mockResolvedValue(exclusions);
    (generateDraw as jest.Mock).mockReturnValue({ ok: true, assignments: [] });
    mockPrismaDb.$transaction.mockResolvedValue([]);
    mockPrismaDb.assignment.findMany.mockResolvedValue([]);

    await generateRound(makePostRequest(url, { groupId: 'group-1' }));

    expect(mockPrismaDb.group.findUnique).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      select: { previousYearMemory: true },
    });
    expect(getPreviousYearExclusions).toHaveBeenCalledWith('group-1', 2026, 2);
    expect(generateDraw).toHaveBeenCalledWith(
      threePeople,
      expect.objectContaining({ exclusions })
    );
  });

  it('defaults the exclusion memory to 1 when the group has no previousYearMemory set', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue(threePeople);
    mockPrismaDb.group.findUnique.mockResolvedValue(null);
    (generateDraw as jest.Mock).mockReturnValue({ ok: true, assignments: [] });
    mockPrismaDb.$transaction.mockResolvedValue([]);
    mockPrismaDb.assignment.findMany.mockResolvedValue([]);

    await generateRound(makePostRequest(url, { groupId: 'group-1' }));

    expect(getPreviousYearExclusions).toHaveBeenCalledWith('group-1', 2026, 1);
  });

  it('ignores a client-supplied year and resolves the active year server-side', async () => {
    mockPrismaDb.person.findMany.mockResolvedValue(threePeople);
    (generateDraw as jest.Mock).mockReturnValue({
      ok: true,
      assignments: [
        { giverId: 'p-1', receiverId: 'p-2' },
        { giverId: 'p-2', receiverId: 'p-3' },
        { giverId: 'p-3', receiverId: 'p-1' },
      ],
    });
    mockPrismaDb.$transaction.mockResolvedValue([]);
    mockPrismaDb.assignment.findMany.mockResolvedValue([]);

    // A client trying to sneak a different year in the body must not affect
    // which year gets generated - only Group.year (via getActiveYear) does.
    await generateRound(makePostRequest(url, { groupId: 'group-1', year: 1999 }));
    expect(ensureRound).toHaveBeenCalledWith('group-1', 2026);
    expect(mockPrismaDb.assignment.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', year: 2026 },
    });
  });
});

// ===========================================================================
// POST /api/rounds/send
// ===========================================================================
describe('POST /api/rounds/send', () => {
  const url = 'http://localhost:3000/api/rounds/send';
  const generatedRound = { id: 'round-1', groupId: 'group-1', year: 2026, status: 'generated' };
  const assignments = [
    { giver: { name: 'Alice', email: 'alice@x.com', personalLinkToken: 'tokA', active: true } },
    { giver: { name: 'Bob', email: null, personalLinkToken: 'tokB', active: true } },
    { giver: { name: 'Zoe', email: 'zoe@x.com', personalLinkToken: 'tokZ', active: false } },
  ];
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    mockPrismaDb.round.findUnique.mockResolvedValue(generatedRound);
    mockPrismaDb.assignment.findMany.mockResolvedValue(assignments);
    mockPrismaDb.group.findUnique.mockResolvedValue({ id: 'group-1', name: 'Smiths' });
  });

  it('returns 400 when groupId is missing', async () => {
    expect((await sendRound(makePostRequest(url, {}))).status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    expect((await sendRound(makePostRequest(url, { groupId: 'group-1' }))).status).toBe(403);
  });

  it('returns 400 when no round exists', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue(null);
    expect((await sendRound(makePostRequest(url, { groupId: 'group-1' }))).status).toBe(400);
  });

  it('refuses to send a draft (nothing generated)', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ ...generatedRound, status: 'draft' });
    expect((await sendRound(makePostRequest(url, { groupId: 'group-1' }))).status).toBe(400);
  });

  it('flips to sent, mails active givers with email, share-links for all active', async () => {
    const res = await sendRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('sent');
    expect(mockPrismaDb.round.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'round-1' }, data: expect.objectContaining({ status: 'sent' }) })
    );
    // Alice (active+email) mailed; Bob (active, no email) not; Zoe (inactive) skipped.
    // sendMatchReadyEmail gets only the GIVER's name - the drawee is never passed.
    expect(sendMatchReadyEmail).toHaveBeenCalledTimes(1);
    expect(sendMatchReadyEmail).toHaveBeenCalledWith('alice@x.com', 'Alice', 'Smiths', expect.stringContaining('/p/tokA'));
    expect(json.sent).toBe(1);
    expect(json.shareLinks).toHaveLength(2); // Alice + Bob, not inactive Zoe
    // the round looked up was the server-resolved active year, not a client one
    expect(mockPrismaDb.round.findUnique).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2026 } },
    });
  });

  it('ignores a client-supplied year and resolves the active year server-side', async () => {
    await sendRound(makePostRequest(url, { groupId: 'group-1', year: 1999 }));
    expect(mockPrismaDb.round.findUnique).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2026 } },
    });
  });

  it('resend on an already-sent round re-mails without re-flipping', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ ...generatedRound, status: 'sent' });
    const res = await sendRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
    expect(mockPrismaDb.round.update).not.toHaveBeenCalled();
    expect(sendMatchReadyEmail).toHaveBeenCalledTimes(1);
  });

  it('reverts a sent round back to generated', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ ...generatedRound, status: 'sent' });
    const res = await sendRound(makePostRequest(url + '?revert=1', { groupId: 'group-1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).reverted).toBe(true);
    expect(mockPrismaDb.round.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'generated', sentAt: null } })
    );
  });

  it('refuses to revert a round that is not sent', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue(generatedRound);
    expect((await sendRound(makePostRequest(url + '?revert=1', { groupId: 'group-1' }))).status).toBe(400);
  });
});

// ===========================================================================
// POST /api/rounds/rollover - one-click "Start next year": advance the
// active-year pointer, materialize next year's round, wipe this year's
// wishlists. Roster/tokens (Person) and blocks (group-scoped) carry forward
// untouched; assignments/rounds/suggestions stay round-scoped history.
// ===========================================================================
describe('POST /api/rounds/rollover', () => {
  const url = 'http://localhost:3000/api/rounds/rollover';
  const people = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }];

  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    mockPrismaDb.round.findUnique.mockResolvedValue(null);
    mockPrismaDb.person.findMany.mockResolvedValue(people);
    mockPrismaDb.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when groupId is missing', async () => {
    const res = await rolloverRound(makePostRequest(url, {}));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the admin does not own the group', async () => {
    mockSession.adminGroupId = 'other-group';
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(403);
  });

  it('rejects when the current round has an unsent draw (status generated)', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ id: 'round-1', status: 'generated' });
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unsent draw for 2026/i);
    expect(mockPrismaDb.$transaction).not.toHaveBeenCalled();
    expect(mockPrismaDb.person.findMany).not.toHaveBeenCalled();
  });

  it('allows rollover when the current round is still a draft (nothing generated)', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ id: 'round-1', status: 'draft' });
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
  });

  it('allows rollover when the current round is already sent', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue({ id: 'round-1', status: 'sent' });
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
  });

  it('allows rollover when there is no round at all yet', async () => {
    mockPrismaDb.round.findUnique.mockResolvedValue(null);
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
  });

  it('advances the year, upserts next round, and wipes wishlists scoped to the group person ids', async () => {
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ year: 2027 });

    // guard checked the CURRENT year's round, not next year's
    expect(mockPrismaDb.round.findUnique).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2026 } },
    });

    // person ids resolved outside the transaction, scoped to the group
    expect(mockPrismaDb.person.findMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1' },
      select: { id: true },
    });

    // transaction composed of exactly: wipe wishlists for those people,
    // upsert next round, advance Group.year
    expect(mockPrismaDb.wishlistItem.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['p-1', 'p-2', 'p-3'] } },
    });
    expect(mockPrismaDb.round.upsert).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2027 } },
      update: {},
      create: { groupId: 'group-1', year: 2027 },
    });
    expect(mockPrismaDb.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { year: 2027 },
    });
    expect(mockPrismaDb.$transaction).toHaveBeenCalledTimes(1);
  });

  it('ignores a client-supplied year and resolves the active year server-side', async () => {
    const res = await rolloverRound(makePostRequest(url, { groupId: 'group-1', year: 1999 }));
    expect(await res.json()).toEqual({ year: 2027 });
    expect(mockPrismaDb.round.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { groupId: 'group-1', year: 2027 } })
    );
  });
});

// ===========================================================================
// POST /api/rounds/seed - one-off admin backfill: hand-record a PAST year's
// giver->receiver pairs so getPreviousYearExclusions has real history from
// the group's very first real draw. `year` must be strictly before the
// active year; every id must belong to the group; no self-pairs; each giver
// at most once. Upserts a finalized ("sent") Round then replaces that year's
// Assignments in one array-form transaction (idempotent re-seed).
// ===========================================================================
describe('POST /api/rounds/seed', () => {
  const url = 'http://localhost:3000/api/rounds/seed';
  const members = [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }];
  const validBody = {
    groupId: 'group-1',
    year: 2025,
    pairs: [
      { giverId: 'p-1', receiverId: 'p-2' },
      { giverId: 'p-2', receiverId: 'p-3' },
      { giverId: 'p-3', receiverId: 'p-1' },
    ],
  };

  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    mockPrismaDb.person.findMany.mockResolvedValue(members);
    mockPrismaDb.round.upsert.mockResolvedValue({ id: 'round-seed', groupId: 'group-1', year: 2025, status: 'sent' });
    mockPrismaDb.$transaction.mockResolvedValue([]);
  });

  it('returns 400 when groupId is missing', async () => {
    const res = await seedRound(makePostRequest(url, { year: 2025, pairs: validBody.pairs }));
    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-admin', async () => {
    delete mockSession.isAdmin;
    const res = await seedRound(makePostRequest(url, validBody));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the admin does not own the group', async () => {
    mockSession.adminGroupId = 'other-group';
    const res = await seedRound(makePostRequest(url, validBody));
    expect(res.status).toBe(403);
  });

  it('rejects a year that is not strictly before the active year', async () => {
    const res = await seedRound(makePostRequest(url, { ...validBody, year: 2026 }));
    expect(res.status).toBe(400);
    expect(mockPrismaDb.person.findMany).not.toHaveBeenCalled();
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects a future year the same way', async () => {
    const res = await seedRound(makePostRequest(url, { ...validBody, year: 2030 }));
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects an empty pairs array', async () => {
    const res = await seedRound(makePostRequest(url, { ...validBody, pairs: [] }));
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects a pair whose giver does not belong to the group', async () => {
    const res = await seedRound(
      makePostRequest(url, { ...validBody, pairs: [{ giverId: 'stranger', receiverId: 'p-2' }] })
    );
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects a pair whose receiver does not belong to the group', async () => {
    const res = await seedRound(
      makePostRequest(url, { ...validBody, pairs: [{ giverId: 'p-1', receiverId: 'stranger' }] })
    );
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects a self-pair', async () => {
    const res = await seedRound(
      makePostRequest(url, { ...validBody, pairs: [{ giverId: 'p-1', receiverId: 'p-1' }] })
    );
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('rejects a duplicate giver (respects Assignment @@unique([giverId, year]))', async () => {
    const res = await seedRound(
      makePostRequest(url, {
        ...validBody,
        pairs: [
          { giverId: 'p-1', receiverId: 'p-2' },
          { giverId: 'p-1', receiverId: 'p-3' },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockPrismaDb.round.upsert).not.toHaveBeenCalled();
  });

  it('upserts a sent round for the given year then creates one assignment per pair', async () => {
    const res = await seedRound(makePostRequest(url, validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ year: 2025, seeded: 3 });

    expect(mockPrismaDb.person.findMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1' },
      select: { id: true },
    });

    expect(mockPrismaDb.round.upsert).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2025 } },
      update: { status: 'sent' },
      create: { groupId: 'group-1', year: 2025, status: 'sent' },
    });

    expect(mockPrismaDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrismaDb.assignment.deleteMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', year: 2025 },
    });
    expect(mockPrismaDb.assignment.create).toHaveBeenCalledTimes(3);
    expect(mockPrismaDb.assignment.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', roundId: 'round-seed', giverId: 'p-1', receiverId: 'p-2', year: 2025 },
    });
    expect(mockPrismaDb.assignment.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', roundId: 'round-seed', giverId: 'p-2', receiverId: 'p-3', year: 2025 },
    });
    expect(mockPrismaDb.assignment.create).toHaveBeenCalledWith({
      data: { groupId: 'group-1', roundId: 'round-seed', giverId: 'p-3', receiverId: 'p-1', year: 2025 },
    });
  });
});

// ===========================================================================
// GET /api/auth/person-data - the participant-facing privacy path (the one the
// wishlist page actually calls). Match must be blind until the round is sent.
// ===========================================================================
describe('GET /api/auth/person-data', () => {
  beforeEach(() => {
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    mockPrismaDb.suggestion.findMany.mockResolvedValue([]);
  });

  it('returns 401 when not logged in', async () => {
    delete mockSession.isLoggedIn;
    expect((await personData()).status).toBe(401);
  });

  it('hides the match until the round is sent (blind before send), and loads no suggestions', async () => {
    mockPrismaDb.person.findUnique.mockResolvedValue({
      wishlistItems: [],
      giverFor: [{
        id: 'a-1',
        roundId: 'round-1',
        receiverId: 'p-2',
        round: { status: 'generated' },
        receiver: { name: 'Bob', wishlistItems: [] },
      }],
    });
    const json = await (await personData()).json();
    expect(json.assignment).toBeNull();
    // Pre-send: assignment is null, so the suggestions query must never fire.
    expect(json.matchSuggestions).toEqual([]);
    expect(mockPrismaDb.suggestion.findMany).not.toHaveBeenCalled();
  });

  it('reveals the match once the round is sent, filtered to the active year', async () => {
    mockPrismaDb.person.findUnique.mockResolvedValue({
      wishlistItems: [],
      giverFor: [{
        id: 'a-1',
        roundId: 'round-1',
        receiverId: 'p-2',
        round: { status: 'sent' },
        receiver: { name: 'Bob', wishlistItems: [] },
      }],
    });
    const json = await (await personData()).json();
    expect(json.assignment).not.toBeNull();
    expect(json.assignment.id).toBe('a-1');

    expect(getActiveYear).toHaveBeenCalledWith('group-1');
    const call = mockPrismaDb.person.findUnique.mock.calls[0][0];
    expect(call.include.giverFor.where).toEqual({ groupId: 'group-1', year: 2026 });
  });

  it("loads the santa's matchSuggestions about their receiver once sent, naming only the named suggesters", async () => {
    mockPrismaDb.person.findUnique.mockResolvedValue({
      wishlistItems: [],
      giverFor: [{
        id: 'a-1',
        roundId: 'round-1',
        receiverId: 'p-2',
        round: { status: 'sent' },
        receiver: { name: 'Bob', wishlistItems: [] },
      }],
    });
    mockPrismaDb.suggestion.findMany.mockResolvedValue([
      { id: 'sug-1', name: 'Socks', note: 'Size 10', named: true, byPerson: { name: 'Carol' } },
      { id: 'sug-2', name: 'Board game', note: null, named: false, byPerson: { name: 'Dave' } },
    ]);

    const json = await (await personData()).json();

    expect(json.matchSuggestions).toEqual([
      { id: 'sug-1', name: 'Socks', note: 'Size 10', from: 'Carol' },
      { id: 'sug-2', name: 'Board game', note: null, from: 'Anonymous' },
    ]);
    expect(mockPrismaDb.suggestion.findMany).toHaveBeenCalledWith({
      where: { roundId: 'round-1', forPersonId: 'p-2' },
      include: { byPerson: { select: { name: true } } },
    });
  });

  // THE KEY NEGATIVE TEST: this is the one place a suggestion crosses to
  // another person. The query must filter on assignment.receiverId (the
  // person the caller is gifting) and must NEVER filter on session.personId
  // (the caller themselves) - otherwise a person who is the SUBJECT of
  // suggestions would see suggestions made about them via their own
  // person-data, which is exactly the leak this route must prevent.
  it("filters matchSuggestions by the receiver's id, never by the caller's own session personId", async () => {
    mockPrismaDb.person.findUnique.mockResolvedValue({
      wishlistItems: [],
      giverFor: [{
        id: 'a-1',
        roundId: 'round-1',
        receiverId: 'p-2',
        round: { status: 'sent' },
        receiver: { name: 'Bob', wishlistItems: [] },
      }],
    });
    mockPrismaDb.suggestion.findMany.mockResolvedValue([]);

    await personData();

    const where = mockPrismaDb.suggestion.findMany.mock.calls[0][0].where;
    expect(where.roundId).toBe('round-1');
    expect(where.forPersonId).toBe('p-2'); // assignment.receiverId
    expect(where.forPersonId).not.toBe(mockSession.personId); // never session.personId
    expect(where.forPersonId).not.toBe('p-1');
  });
});

// ===========================================================================
// PATCH /api/people/[id] rotateLink - durable-link rotation (admin)
// ===========================================================================
describe('PATCH /api/people/[id] rotateLink', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
    mockPrismaDb.person.findUnique.mockResolvedValue({ id: 'person-1', groupId: 'group-1' });
    mockPrismaDb.person.update.mockResolvedValue({ id: 'person-1', personalLinkToken: 'tok_test' });
  });

  it('reissues a fresh personalLinkToken', async () => {
    const res = await patchPerson(
      makePatchRequest('http://localhost:3000/api/people/person-1', { rotateLink: true }),
      { params: { id: 'person-1' } } as any
    );
    expect(res.status).toBe(200);
    expect(generatePersonalLinkToken).toHaveBeenCalled();
    expect(mockPrismaDb.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ personalLinkToken: 'tok_test' }) })
    );
  });

  it('rejects a PATCH with neither active nor rotateLink', async () => {
    const res = await patchPerson(
      makePatchRequest('http://localhost:3000/api/people/person-1', {}),
      { params: { id: 'person-1' } } as any
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// GET /api/roster - participant-safe roster (id+name only, never tokens/email)
// Lets a logged-in participant pick who to suggest a gift for. Roster GET is
// participant-gated (unlike /api/people, which is admin-only because it
// includes each person's personalLinkToken - a bearer login credential).
// ===========================================================================
describe('GET /api/roster', () => {
  beforeEach(() => {
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
  });

  it('returns 401 when not logged in', async () => {
    delete mockSession.isLoggedIn;
    const res = await getRoster();
    expect(res.status).toBe(401);
  });

  it("returns {id,name} for the session group's active people, excluding the caller", async () => {
    const roster = [
      { id: 'p-2', name: 'Bob' },
      { id: 'p-3', name: 'Carol' },
    ];
    mockPrismaDb.person.findMany.mockResolvedValue(roster);

    const res = await getRoster();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.roster).toEqual(roster);

    expect(mockPrismaDb.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', active: true, id: { not: 'p-1' } },
      })
    );
  });

  it('never leaks personalLinkToken or email - prisma select is id+name only', async () => {
    const roster = [{ id: 'p-2', name: 'Bob' }];
    mockPrismaDb.person.findMany.mockResolvedValue(roster);

    const res = await getRoster();
    const bodyText = JSON.stringify(await res.json());
    expect(bodyText).not.toContain('personalLinkToken');
    expect(bodyText).not.toContain('email');

    expect(mockPrismaDb.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } })
    );
  });
});

// ===========================================================================
// POST/GET/DELETE /api/suggestions
// ===========================================================================
describe('/api/suggestions', () => {
  const url = 'http://localhost:3000/api/suggestions';

  beforeEach(() => {
    mockSession.isLoggedIn = true;
    mockSession.personId = 'p-1';
    mockSession.groupId = 'group-1';
    (getActiveYear as jest.Mock).mockResolvedValue(2026);
    (ensureRound as jest.Mock).mockResolvedValue({ id: 'round-1', groupId: 'group-1', year: 2026, status: 'draft' });
    mockPrismaDb.group.findUnique.mockResolvedValue({ suggestionCap: 3 });
  });

  describe('POST /api/suggestions', () => {
    it('returns 401 when not logged in', async () => {
      delete mockSession.isLoggedIn;
      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-2', name: 'Socks' }));
      expect(res.status).toBe(401);
    });

    it('returns 400 with the exact validateSuggestionInput message for a self-suggestion', async () => {
      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-1', name: 'Socks' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("You can't add a suggestion for yourself.");
      // Validation short-circuits before any DB membership lookup.
      expect(mockPrismaDb.person.findFirst).not.toHaveBeenCalled();
    });

    it('returns 400 when name is missing', async () => {
      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-2', name: '' }));
      expect(res.status).toBe(400);
    });

    it("returns 404 when forPerson is not an active member of the caller's group", async () => {
      mockPrismaDb.person.findFirst.mockResolvedValue(null);
      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-2', name: 'Socks' }));
      expect(res.status).toBe(404);
      expect(mockPrismaDb.person.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-2', groupId: 'group-1', active: true },
      });
    });

    it('creates a suggestion under the cap (201), trimmed, with byPerson from the session', async () => {
      mockPrismaDb.person.findFirst.mockResolvedValue({ id: 'p-2', groupId: 'group-1', active: true });
      mockPrismaDb.suggestion.count.mockResolvedValue(1);
      mockPrismaDb.suggestion.create.mockResolvedValue({
        id: 'sug-1',
        roundId: 'round-1',
        forPersonId: 'p-2',
        byPersonId: 'p-1',
        name: 'Socks',
        note: null,
        named: false,
      });

      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-2', name: '  Socks  ' }));
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.suggestion).toEqual({
        id: 'sug-1',
        forPersonId: 'p-2',
        name: 'Socks',
        note: null,
        named: false,
      });

      expect(mockPrismaDb.suggestion.count).toHaveBeenCalledWith({
        where: { roundId: 'round-1', byPersonId: 'p-1', forPersonId: 'p-2' },
      });
      expect(mockPrismaDb.suggestion.create).toHaveBeenCalledWith({
        data: {
          roundId: 'round-1',
          forPersonId: 'p-2',
          byPersonId: 'p-1',
          name: 'Socks',
          note: null,
          named: false,
        },
      });
    });

    it('rejects at the cap with the exact message and does not create', async () => {
      mockPrismaDb.person.findFirst.mockResolvedValue({ id: 'p-2', groupId: 'group-1', active: true });
      mockPrismaDb.suggestion.count.mockResolvedValue(3);

      const res = await createSuggestion(makePostRequest(url, { forPersonId: 'p-2', name: 'Socks' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('You can add at most 3 suggestions for one person.');
      expect(mockPrismaDb.suggestion.create).not.toHaveBeenCalled();
    });

    it("ignores a client-supplied byPersonId - byPerson always comes from the session", async () => {
      mockPrismaDb.person.findFirst.mockResolvedValue({ id: 'p-2', groupId: 'group-1', active: true });
      mockPrismaDb.suggestion.count.mockResolvedValue(0);
      mockPrismaDb.suggestion.create.mockResolvedValue({
        id: 'sug-1',
        roundId: 'round-1',
        forPersonId: 'p-2',
        byPersonId: 'p-1',
        name: 'Socks',
        note: null,
        named: false,
      });

      // A body trying to plant a suggestion "from" someone else must not
      // succeed in doing so - the cap check and the create must both use the
      // session's own personId regardless of what the body claims.
      await createSuggestion(
        makePostRequest(url, { forPersonId: 'p-2', name: 'Socks', byPersonId: 'someone-else' })
      );
      expect(mockPrismaDb.suggestion.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ byPersonId: 'p-1' }) })
      );
      expect(mockPrismaDb.suggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ byPersonId: 'p-1' }) })
      );
    });
  });

  describe('GET /api/suggestions?mine=1', () => {
    it('returns 401 when not logged in', async () => {
      delete mockSession.isLoggedIn;
      const res = await getSuggestions(makeGetRequest(url + '?mine=1'));
      expect(res.status).toBe(401);
    });

    it("returns only the caller's own suggestions for the active round", async () => {
      const mine = [
        {
          id: 'sug-1',
          forPersonId: 'p-2',
          byPersonId: 'p-1',
          name: 'Socks',
          note: null,
          named: false,
          forPerson: { name: 'Bob' },
        },
      ];
      mockPrismaDb.suggestion.findMany.mockResolvedValue(mine);

      const res = await getSuggestions(makeGetRequest(url + '?mine=1'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.suggestions).toEqual(mine);

      expect(mockPrismaDb.suggestion.findMany).toHaveBeenCalledWith({
        where: { byPersonId: 'p-1', roundId: 'round-1' },
        include: { forPerson: { select: { name: true } } },
      });
    });

    it("never scopes by any id but the caller's own session personId", async () => {
      mockPrismaDb.suggestion.findMany.mockResolvedValue([]);
      await getSuggestions(makeGetRequest(url + '?mine=1'));
      const where = mockPrismaDb.suggestion.findMany.mock.calls[0][0].where;
      expect(where.byPersonId).toBe('p-1');
      expect(where.byPersonId).not.toBe('p-2');
      expect(where.forPersonId).toBeUndefined();
    });
  });

  describe('DELETE /api/suggestions', () => {
    it('returns 401 when not logged in', async () => {
      delete mockSession.isLoggedIn;
      const res = await deleteSuggestion(makeDeleteRequest(url + '?id=sug-1'));
      expect(res.status).toBe(401);
    });

    it('returns 400 when id is missing', async () => {
      const res = await deleteSuggestion(makeDeleteRequest(url));
      expect(res.status).toBe(400);
    });

    it('returns 404 for a suggestion that does not exist', async () => {
      mockPrismaDb.suggestion.findUnique.mockResolvedValue(null);
      const res = await deleteSuggestion(makeDeleteRequest(url + '?id=nope'));
      expect(res.status).toBe(404);
    });

    it("returns 403 deleting another person's suggestion and does not delete it", async () => {
      mockPrismaDb.suggestion.findUnique.mockResolvedValue({ id: 'sug-1', byPersonId: 'someone-else' });
      const res = await deleteSuggestion(makeDeleteRequest(url + '?id=sug-1'));
      expect(res.status).toBe(403);
      expect(mockPrismaDb.suggestion.delete).not.toHaveBeenCalled();
    });

    it('deletes own suggestion (200)', async () => {
      mockPrismaDb.suggestion.findUnique.mockResolvedValue({ id: 'sug-1', byPersonId: 'p-1' });
      mockPrismaDb.suggestion.delete.mockResolvedValue({ id: 'sug-1' });
      const res = await deleteSuggestion(makeDeleteRequest(url + '?id=sug-1'));
      expect(res.status).toBe(200);
      expect(mockPrismaDb.suggestion.delete).toHaveBeenCalledWith({ where: { id: 'sug-1' } });
    });
  });
});
