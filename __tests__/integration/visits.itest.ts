/**
 * REAL SQLITE verification for visit analytics. Not part of `npm test` (the .itest.ts
 * suffix does not match jest.config's `*.test.ts`). Run explicitly, and note BOTH the
 * --runInBand and the targeted testMatch: constraints.itest.ts wipes the same tables in
 * ITS beforeAll, so the two must never run in parallel workers against one database file.
 *
 *   DATABASE_URL="file:$PWD/.tmp-visits.db" npx prisma db push --skip-generate
 *   DATABASE_URL="file:$PWD/.tmp-visits.db" npx jest --runInBand --testMatch='**\/visits.itest.ts'
 *
 * WHY THIS EXISTS. Two things here are invisible to __tests__/api/routes.test.ts:
 *
 *   1. Its Prisma mocks are jest.fn()s that IGNORE their `where` clause. So the mocked
 *      "scopes visits to the active year" test only proves the string `year: 2026` was
 *      PASSED, not that the database HONOURED it. A query that lost its year filter would
 *      pass that suite green forever and quietly show the admin last Christmas's numbers
 *      as if they were this year's. That exact bug class already shipped on this repo once
 *      (the pins query, which had no groupId and could leak a past year's draw).
 *
 *   2. The debounce is a UNIQUE INDEX. A mock cannot have one. The burst case below - ten
 *      concurrent recordVisit calls collapsing to a single row - is the whole reason the
 *      debounce was built as a unique key instead of a findFirst-then-create, and it is
 *      structurally unreachable from a mocked test.
 *
 * Only @/lib/session is mocked (so the admin gate has an admin to see). Prisma, lib/rounds,
 * lib/visits and the route handler are all real.
 */
import { prisma } from '@/lib/db';
import { GET as getPeople } from '@/app/api/people/route';
import { recordVisit } from '@/lib/visits';
import { NextRequest } from 'next/server';

const mockSession: Record<string, unknown> = { isAdmin: true, isLoggedIn: true };
jest.mock('@/lib/session', () => ({
  getSession: jest.fn(async () => mockSession),
  getSessionFromRequest: jest.fn(async () => mockSession),
  cookieSecure: jest.fn(() => false),
}));

const get = (url: string) => new NextRequest(new URL(url), { method: 'GET' });

let groupId: string;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  await prisma.visit.deleteMany();
  await prisma.person.deleteMany();
  await prisma.group.deleteMany();

  // A group whose CURRENT year is 2026, but which also has real history in 2025 - because
  // "does the query leak last year" is the whole question.
  const group = await prisma.group.create({
    data: { name: 'Test Family', inviteCode: 'itest-visits', year: 2026 },
  });
  groupId = group.id;

  const alice = await prisma.person.create({
    data: { groupId, name: 'Alice', personalLinkToken: 'tok-alice' },
  });
  aliceId = alice.id;

  const bob = await prisma.person.create({
    data: { groupId, name: 'Bob', personalLinkToken: 'tok-bob' },
  });
  bobId = bob.id;

  // Alice: 3 visits LAST year, 2 THIS year. Bob: never showed up at all.
  await prisma.visit.createMany({
    data: [
      { personId: aliceId, year: 2025, bucket: 1, createdAt: new Date('2025-12-01T10:00:00Z') },
      { personId: aliceId, year: 2025, bucket: 2, createdAt: new Date('2025-12-05T10:00:00Z') },
      { personId: aliceId, year: 2025, bucket: 3, createdAt: new Date('2025-12-09T10:00:00Z') },
      { personId: aliceId, year: 2026, bucket: 4, createdAt: new Date('2026-07-01T10:00:00Z') },
      { personId: aliceId, year: 2026, bucket: 5, createdAt: new Date('2026-07-02T10:00:00Z') },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

it('counts THIS year only, and does not leak last year', async () => {
  const res = await getPeople(get(`http://localhost:3000/api/people?groupId=${groupId}`));
  const alice = (await res.json()).people.find((p: { name: string }) => p.name === 'Alice');

  // 2, not 5. If this says 5, the year filter is not reaching the database.
  expect(alice.visitCount).toBe(2);
  expect(new Date(alice.lastVisitAt)).toEqual(new Date('2026-07-02T10:00:00Z'));
});

it('reports someone who never opened their link as a real zero', async () => {
  const res = await getPeople(get(`http://localhost:3000/api/people?groupId=${groupId}`));
  const bob = (await res.json()).people.find((p: { name: string }) => p.name === 'Bob');

  expect(bob.visitCount).toBe(0);
  expect(bob.lastVisitAt).toBeNull();
  expect(bob.recentVisits).toBe(0);
});

// The debounce is a UNIQUE INDEX, so only a real database can prove it holds - and this is
// the burst it was built for: the admin hits Send, the whole family opens the email, and
// one person's browser fires several requests at once. A findFirst-then-create would let
// every one of these see "no recent visit" and insert.
it('records one visit per half hour, even when ten requests land at once', async () => {
  await Promise.all(Array.from({ length: 10 }, () => recordVisit(bobId, 2026)));

  const count = await prisma.visit.count({ where: { personId: bobId, year: 2026 } });
  expect(count).toBe(1);
});
