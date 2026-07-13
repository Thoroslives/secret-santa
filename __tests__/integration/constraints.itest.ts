/**
 * REAL SQLITE verification for the constraints API. Not part of `npm test` (the .itest.ts
 * suffix does not match jest.config's `*.test.ts`), run explicitly:
 *
 *   DATABASE_URL="file:$PWD/.tmp-verify.db" npx prisma db push --skip-generate
 *   DATABASE_URL="file:$PWD/.tmp-verify.db" npx jest --testMatch='**\/*.itest.ts'
 *
 * WHY THIS EXISTS. __tests__/api/routes.test.ts mocks Prisma, and the mocks are
 * `jest.fn()`s that IGNORE their `where` clause. So a query with a wrong filter returns
 * whatever the mock was told to return and passes green. That is not hypothetical: it
 * already burned a previous session on this repo, and for THIS feature it is the single
 * most dangerous failure available -
 *
 *   ForcedPin has no groupId (only roundId). A pins query that traversed group->round
 *   without pinning the year would return EVERY PAST YEAR'S PINS, and the mocked suite
 *   would be perfectly happy about it.
 *
 * A ForcedPin row says "A draws B". It IS the draw. So this file runs the real handlers
 * against a real database with two years of real rounds in it, and checks what actually
 * comes back.
 *
 * Only @/lib/session is mocked (so requireAdmin has an admin to see). Prisma, lib/rounds
 * and the route handlers are all real.
 */
import { prisma } from '@/lib/db';
import { GET as getPins, POST as createPin } from '@/app/api/pins/route';
import { GET as getBlocks, POST as createBlock } from '@/app/api/blocks/route';
import { NextRequest } from 'next/server';

const mockSession: Record<string, unknown> = { isAdmin: true, isLoggedIn: true };
jest.mock('@/lib/session', () => ({
  getSession: jest.fn(async () => mockSession),
  getSessionFromRequest: jest.fn(async () => mockSession),
  cookieSecure: jest.fn(() => false),
}));

const get = (url: string) => new NextRequest(new URL(url), { method: 'GET' });
const post = (url: string, body: unknown) =>
  new NextRequest(new URL(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const PINS = 'http://localhost:3000/api/pins';
const BLOCKS = 'http://localhost:3000/api/blocks';

beforeAll(async () => {
  // Wipe, then build a group whose CURRENT year is 2026 but which also has real history
  // in 2025 - because "does the query leak last year's pins" is the whole question.
  await prisma.forcedPin.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.block.deleteMany();
  await prisma.round.deleteMany();
  await prisma.person.deleteMany();
  await prisma.group.deleteMany();

  await prisma.group.create({
    data: { id: 'grp', name: 'Verify', inviteCode: 'VERIFY', year: 2026 },
  });
  await prisma.person.createMany({
    data: [
      { id: 'alice', groupId: 'grp', name: 'Alice', personalLinkToken: 'tk-a', active: true },
      { id: 'bob', groupId: 'grp', name: 'Bob', personalLinkToken: 'tk-b', active: true },
      { id: 'cara', groupId: 'grp', name: 'Cara', personalLinkToken: 'tk-c', active: true },
      // Deactivated. GET /api/people does NOT filter these out, so the dashboard's picker
      // still offers her - but generate() only ever draws from { active: true }.
      { id: 'zoe', groupId: 'grp', name: 'Zoe', personalLinkToken: 'tk-z', active: false },
    ],
  });

  // LAST year's round, with a pin in it. This is the bait.
  await prisma.round.create({
    data: { id: 'r2025', groupId: 'grp', year: 2025, status: 'sent' },
  });
  await prisma.forcedPin.create({
    data: { id: 'pin-2025', roundId: 'r2025', giverId: 'alice', receiverId: 'bob' },
  });

  // THIS year's round: generated, with a real draw in it.
  await prisma.round.create({
    data: { id: 'r2026', groupId: 'grp', year: 2026, status: 'generated' },
  });
  await prisma.forcedPin.create({
    data: { id: 'pin-2026', roundId: 'r2026', giverId: 'cara', receiverId: 'alice' },
  });
  await prisma.assignment.createMany({
    data: [
      { groupId: 'grp', roundId: 'r2026', year: 2026, giverId: 'alice', receiverId: 'bob' },
      { groupId: 'grp', roundId: 'r2026', year: 2026, giverId: 'bob', receiverId: 'cara' },
      { groupId: 'grp', roundId: 'r2026', year: 2026, giverId: 'cara', receiverId: 'alice' },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('REAL DB: GET /api/pins is scoped to the active round', () => {
  it('returns ONLY 2026 pins - never 2025 - even though both rows exist', async () => {
    const res = await getPins(get(`${PINS}?groupId=grp`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.year).toBe(2026);
    const ids = body.pins.map((p: { id: string }) => p.id);
    expect(ids).toEqual(['pin-2026']);
    // The assertion the mocked suite structurally CANNOT make:
    expect(ids).not.toContain('pin-2025');
  });

  it('a participant is refused by the handler itself, not just the middleware', async () => {
    delete mockSession.isAdmin;
    const res = await getPins(get(`${PINS}?groupId=grp`));
    expect(res.status).toBe(403);
    mockSession.isAdmin = true;
  });
});

describe('REAL DB: membership validation', () => {
  it('rejects a pin at a DEACTIVATED person (the picker still offers her)', async () => {
    const res = await createPin(post(PINS, { groupId: 'grp', giverId: 'bob', receiverId: 'zoe' }));
    expect(res.status).toBe(400);
    // The point: without this, the pin saved, and the error surfaced only later at
    // generate, as `Invalid pin: receiver "<raw cuid>" is not in the group`.
    expect(await prisma.forcedPin.findFirst({ where: { receiverId: 'zoe' } })).toBeNull();
  });

  it('ALLOWS a block naming that same deactivated person - a block is permanent', async () => {
    const res = await createBlock(post(BLOCKS, { groupId: 'grp', personAId: 'bob', personBId: 'zoe' }));
    expect(res.status).toBe(201);
    const blocks = await getBlocks(get(`${BLOCKS}?groupId=grp`)).then((r) => r.json());
    expect(blocks.blocks).toHaveLength(1);
    await prisma.block.deleteMany();
  });
});

describe('REAL DB: the stale-draw guard', () => {
  it('REFUSES a pin the generated draw contradicts, and writes nothing', async () => {
    // The real draw has alice -> bob. Pinning alice -> cara contradicts it.
    const res = await createPin(post(PINS, { groupId: 'grp', giverId: 'alice', receiverId: 'cara' }));
    expect(res.status).toBe(409);

    // Nothing written, and - the part that actually matters - nothing DESTROYED.
    expect(await prisma.forcedPin.findFirst({ where: { giverId: 'alice', roundId: 'r2026' } })).toBeNull();
    expect(await prisma.assignment.count({ where: { roundId: 'r2026' } })).toBe(3);
    expect((await prisma.round.findUnique({ where: { id: 'r2026' } }))?.status).toBe('generated');
  });

  it('ALLOWS a pin the generated draw already satisfies', async () => {
    // The draw already has bob -> cara.
    const res = await createPin(post(PINS, { groupId: 'grp', giverId: 'bob', receiverId: 'cara' }));
    expect(res.status).toBe(201);
    expect(await prisma.assignment.count({ where: { roundId: 'r2026' } })).toBe(3);
  });

  it('REFUSES a block the generated draw pairs, in either direction', async () => {
    // The draw has alice -> bob. Blocking bob+alice contradicts it (blocks are symmetric).
    const res = await createBlock(post(BLOCKS, { groupId: 'grp', personAId: 'bob', personBId: 'alice' }));
    expect(res.status).toBe(409);
    expect(await prisma.block.count()).toBe(0);
    expect(await prisma.assignment.count({ where: { roundId: 'r2026' } })).toBe(3);
  });
});
