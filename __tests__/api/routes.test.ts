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
    create: jest.fn(),
    delete: jest.fn(),
  },
  forcedPin: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
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
}));

// ---------------------------------------------------------------------------
// Mock @/lib/secret-santa
// ---------------------------------------------------------------------------
jest.mock('@/lib/secret-santa', () => ({
  generateSecretSantaAssignments: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/rounds (ensureRound) so pin/generate tests control the round
// ---------------------------------------------------------------------------
jest.mock('@/lib/rounds', () => ({
  ensureRound: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import bcrypt from 'bcryptjs';
import { ensureRound } from '@/lib/rounds';
import { generateGroupInviteCode, generatePersonalLinkToken, validateWishlistItems } from '@/lib/utils';
import { sendLoginLinkEmail } from '@/lib/email';
import { generateSecretSantaAssignments } from '@/lib/secret-santa';

import { POST as createGroup } from '@/app/api/groups/create/route';
import { POST as verifyGroup } from '@/app/api/groups/verify/route';
import { GET as getGroup, PATCH as patchGroup } from '@/app/api/groups/[id]/route';
import { GET as personalLinkLogin } from '@/app/p/[token]/route';
import { POST as emailLink } from '@/app/api/auth/email-link/route';
import { GET as getPeople, POST as createPerson } from '@/app/api/people/route';
import { DELETE as deletePerson, PATCH as patchPerson } from '@/app/api/people/[id]/route';
import { POST as updateWishlist } from '@/app/api/wishlist/route';
import { POST as generateAssignments } from '@/app/api/assignments/generate/route';
import { GET as getAssignments, DELETE as deleteAssignments } from '@/app/api/assignments/route';
import { POST as adminAuth } from '@/app/api/admin/auth/route';
import { POST as createBlock, DELETE as deleteBlock } from '@/app/api/blocks/route';
import { POST as createPin, DELETE as deletePin } from '@/app/api/pins/route';

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
  it('returns 400 when groupId is missing', async () => {
    const req = makeGetRequest('http://localhost:3000/api/people');
    const res = await getPeople(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 200 with list of people', async () => {
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
      // Bridge column until Task 12 drops it - still written, but now derived from the
      // same generator as personalLinkToken, not the retired generateLoginCode.
      loginCode: 'tok_test',
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
        data: expect.objectContaining({ personalLinkToken: 'tok_test', loginCode: 'tok_test' }),
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

    it('returns 400 when active is not a boolean', async () => {
      const req = makePatchRequest(url, { active: 'nope' });
      const res = await patchPerson(req, { params: { id: 'person-1' } } as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('active must be a boolean');
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
      // Legacy NOT NULL column, written as a placeholder until Task 12 drops it.
      link: '',
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
        link: '',
        order: 0,
      },
    });
  });
});

// ===========================================================================
// 12. POST /api/assignments/generate
// ===========================================================================
describe('POST /api/assignments/generate', () => {
  const url = 'http://localhost:3000/api/assignments/generate';

  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makePostRequest(url, {});
    const res = await generateAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 400 when assignments already exist', async () => {
    mockPrismaDb.assignment.findMany.mockResolvedValue([{ id: 'a-1' }]);

    const req = makePostRequest(url, { groupId: 'group-1' });
    const res = await generateAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Assignments already exist');
  });

  it('returns 400 when there are too few people', async () => {
    mockPrismaDb.assignment.findMany.mockResolvedValue([]);
    mockPrismaDb.person.findMany.mockResolvedValue([
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' },
    ]);

    const req = makePostRequest(url, { groupId: 'group-1' });
    const res = await generateAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('at least 3 people');
  });

  it('returns 200 on successful generation', async () => {
    const people = [
      { id: 'p-1', name: 'Alice' },
      { id: 'p-2', name: 'Bob' },
      { id: 'p-3', name: 'Charlie' },
    ];
    const assignmentPairs = [
      { giverId: 'p-1', receiverId: 'p-2' },
      { giverId: 'p-2', receiverId: 'p-3' },
      { giverId: 'p-3', receiverId: 'p-1' },
    ];

    mockPrismaDb.assignment.findMany.mockResolvedValue([]);
    mockPrismaDb.person.findMany.mockResolvedValue(people);
    (generateSecretSantaAssignments as jest.Mock).mockReturnValue(assignmentPairs);

    const createdAssignments = assignmentPairs.map((a, i) => ({
      id: `assign-${i}`,
      ...a,
      giver: people.find((p) => p.id === a.giverId),
      receiver: people.find((p) => p.id === a.receiverId),
    }));
    mockPrismaDb.assignment.create
      .mockResolvedValueOnce(createdAssignments[0])
      .mockResolvedValueOnce(createdAssignments[1])
      .mockResolvedValueOnce(createdAssignments[2]);

    const req = makePostRequest(url, { groupId: 'group-1' });
    const res = await generateAssignments(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assignments).toHaveLength(3);
    expect(json.count).toBe(3);
    expect(generateSecretSantaAssignments).toHaveBeenCalledWith(people);
  });
});

// ===========================================================================
// 13. GET /api/assignments
// ===========================================================================
describe('GET /api/assignments', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makeGetRequest('http://localhost:3000/api/assignments');
    const res = await getAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 200 with assignments', async () => {
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
  });
});

// ===========================================================================
// 14. DELETE /api/assignments
// ===========================================================================
describe('DELETE /api/assignments', () => {
  beforeEach(() => {
    mockSession.isAdmin = true;
    mockSession.adminGroupId = 'group-1';
  });

  it('returns 400 when groupId is missing', async () => {
    const req = makeDeleteRequest('http://localhost:3000/api/assignments');
    const res = await deleteAssignments(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Group ID is required');
  });

  it('returns 200 on successful deletion', async () => {
    mockPrismaDb.assignment.deleteMany.mockResolvedValue({ count: 3 });

    const req = makeDeleteRequest('http://localhost:3000/api/assignments?groupId=group-1');
    const res = await deleteAssignments(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
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
});
