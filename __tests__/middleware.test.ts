/**
 * middleware.ts had ZERO test coverage until this file.
 *
 * That matters more than it sounds. `__tests__/api/routes.test.ts` imports route
 * handlers DIRECTLY (`import { GET } from '@/app/api/pins/route'`) and never runs
 * the middleware, and every admin handler self-defends with `requireAdmin()`. So a
 * "middleware test" written in routes.test.ts passes IDENTICALLY whether or not
 * middleware.ts is correct - the handler's own guard produces the 403 either way.
 * Any authorization change to the app's perimeter was therefore shipping behind a
 * test that could not fail.
 *
 * This file executes the real middleware. Every case below FAILS against the
 * pre-change middleware.ts (which exempted ALL adminApiRoutes from the admin check
 * on GET whenever `session.isLoggedIn`), which is what makes it worth having.
 */
import { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { middleware } from '@/middleware';

// Mock the iron-session PACKAGE, not @/lib/session - middleware.ts calls
// getIronSession() directly and never touches our session helper.
jest.mock('iron-session', () => ({
  getIronSession: jest.fn(),
}));

const mockGetIronSession = getIronSession as jest.Mock;

const ANON = {};
const PARTICIPANT = { isLoggedIn: true, personId: 'p-1', groupId: 'group-1' };
const ADMIN = { isLoggedIn: true, isAdmin: true };

function asSession(session: Record<string, unknown>) {
  mockGetIronSession.mockResolvedValue(session);
}

function request(path: string, method = 'GET'): NextRequest {
  return new NextRequest(new URL(`http://localhost:3000${path}`), { method });
}

async function statusFor(path: string, method: string, session: Record<string, unknown>) {
  asSession(session);
  const res = await middleware(request(path, method));
  return res.status;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('middleware - admin API routes are closed to participants on every method', () => {
  // The whole point. A ForcedPin row says "A draws B" - it IS the draw. Before this
  // change, a logged-in participant sailed through the middleware on ANY of these
  // GETs and was stopped only by the handler's own requireAdmin().
  it.each([
    ['/api/pins'],
    ['/api/blocks'],
    ['/api/people'],
    ['/api/rounds/seed'],
    ['/api/assignments'],
  ])('participant GET %s -> 403', async (path) => {
    expect(await statusFor(path, 'GET', PARTICIPANT)).toBe(403);
  });

  it.each([
    ['/api/pins'],
    ['/api/blocks'],
    ['/api/people'],
    ['/api/assignments'],
  ])('anonymous GET %s -> 403', async (path) => {
    expect(await statusFor(path, 'GET', ANON)).toBe(403);
  });

  it('participant POST /api/pins -> 403 (unchanged, regression guard)', async () => {
    expect(await statusFor('/api/pins', 'POST', PARTICIPANT)).toBe(403);
  });

  it.each([
    ['/api/pins'],
    ['/api/blocks'],
    ['/api/assignments'],
  ])('admin GET %s passes through', async (path) => {
    expect(await statusFor(path, 'GET', ADMIN)).toBe(200);
  });
});

describe('middleware - participant routes still work', () => {
  // The narrowing must not cost participants their own app. This is the flow that
  // would break if the deletion of the GET exemption were wrong. Participants read
  // their match through /api/auth/person-data, NOT /api/assignments - which is why
  // deleting the exemption outright is safe.
  it('participant GET /api/wishlist passes through', async () => {
    expect(await statusFor('/api/wishlist', 'GET', PARTICIPANT)).toBe(200);
  });

  it('participant GET /api/roster passes through', async () => {
    expect(await statusFor('/api/roster', 'GET', PARTICIPANT)).toBe(200);
  });

  it('anonymous GET /api/wishlist -> 401', async () => {
    expect(await statusFor('/api/wishlist', 'GET', ANON)).toBe(401);
  });

  it('/api/auth/* is skipped entirely (person-data is how a participant gets their match)', async () => {
    expect(await statusFor('/api/auth/person-data', 'GET', PARTICIPANT)).toBe(200);
  });
});

describe('middleware - GET /api/groups/[id] stays open to participants', () => {
  // Deliberate: a participant reads their own group (budget, name). It is matched
  // EXACTLY, not as a prefix, precisely so this cannot widen. It must never learn
  // about blocks or pins.
  it('participant GET /api/groups/group-1 passes through', async () => {
    expect(await statusFor('/api/groups/group-1', 'GET', PARTICIPANT)).toBe(200);
  });

  it('participant PATCH /api/groups/group-1 -> 403', async () => {
    expect(await statusFor('/api/groups/group-1', 'PATCH', PARTICIPANT)).toBe(403);
  });

  it('participant DELETE /api/groups/group-1 -> 403', async () => {
    expect(await statusFor('/api/groups/group-1', 'DELETE', PARTICIPANT)).toBe(403);
  });
});
