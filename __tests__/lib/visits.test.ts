/**
 * recordVisit - the write half of visit analytics.
 *
 * The debounce is a UNIQUE KEY, not a read-then-write, and these tests pin the two
 * properties that come out of that choice: one INSERT (never a findFirst first), and a
 * P2002 collision treated as success rather than as a fault.
 *
 * The unique key itself can only be proven by a real database, so that lives in
 * __tests__/integration/visits.itest.ts (including the concurrent-burst case, which is
 * structurally unreachable from a mock).
 */
const mockPrismaDb = {
  visit: { create: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: mockPrismaDb }));

import { recordVisit, VISIT_DEBOUNCE_MS, RECENT_VISIT_WINDOW_MS } from '@/lib/visits';

// These two guard a PRODUCT DECISION, not an implementation detail, which is why they are
// worth the four lines despite looking like they assert a constant against itself.
//
// "A visit is one 30-minute window" was chosen deliberately over "one per calendar day" and
// "every page load". Nothing else in the suite pins it: every other test derives the bucket
// FROM VISIT_DEBOUNCE_MS, so they are all self-referential and would stay green if the value
// silently became a week. And the value now sits one line away from RECENT_VISIT_WINDOW_MS,
// which is exactly the copy-paste that would do it - so the second test pins them apart.
describe('the debounce window', () => {
  it('is 30 minutes, because that is the decision', () => {
    expect(VISIT_DEBOUNCE_MS).toBe(30 * 60 * 1000);
  });

  it('is not the same thing as the dashboard "recent" window', () => {
    expect(RECENT_VISIT_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(VISIT_DEBOUNCE_MS).not.toBe(RECENT_VISIT_WINDOW_MS);
  });
});

describe('recordVisit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaDb.visit.create.mockResolvedValue({ id: 'v1' });
  });

  it('writes one row keyed to the current half-hour bucket', async () => {
    const before = Math.floor(Date.now() / VISIT_DEBOUNCE_MS);
    await recordVisit('p1', 2026);
    const after = Math.floor(Date.now() / VISIT_DEBOUNCE_MS);

    expect(mockPrismaDb.visit.create).toHaveBeenCalledTimes(1);
    const data = mockPrismaDb.visit.create.mock.calls[0][0].data;
    expect(data.personId).toBe('p1');
    expect(data.year).toBe(2026);
    expect(data.bucket).toBeGreaterThanOrEqual(before);
    expect(data.bucket).toBeLessThanOrEqual(after);
  });

  // The debounce, and the reason there is no findFirst: a second visit inside the same
  // half hour collides on @@unique([personId, year, bucket]) and the DATABASE throws it away.
  it('swallows the unique violation when they were already here this half hour', async () => {
    mockPrismaDb.visit.create.mockRejectedValue({ code: 'P2002' });

    await expect(recordVisit('p1', 2026)).resolves.toBeUndefined();
  });

  // The OTHER half of the debounce, and the half that was missing: once the window has
  // passed, recordVisit must compute a DIFFERENT bucket, so the unique key lets the row
  // through. Without this, every test here derives the bucket from VISIT_DEBOUNCE_MS and is
  // therefore self-referential - nothing proved the number ever advances with the clock.
  it('computes a new bucket once the window has passed, so the next visit lands', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-12-01T10:00:00Z'));
    await recordVisit('p1', 2026);
    const firstBucket = mockPrismaDb.visit.create.mock.calls[0][0].data.bucket;

    // Same half hour: same bucket, so the DB would reject it as a duplicate.
    jest.setSystemTime(new Date('2026-12-01T10:29:00Z'));
    await recordVisit('p1', 2026);
    expect(mockPrismaDb.visit.create.mock.calls[1][0].data.bucket).toBe(firstBucket);

    // Past the boundary: a new bucket, so it is a new visit.
    jest.setSystemTime(new Date('2026-12-01T10:31:00Z'));
    await recordVisit('p1', 2026);
    expect(mockPrismaDb.visit.create.mock.calls[2][0].data.bucket).toBe(firstBucket + 1);

    jest.useRealTimers();
  });

  // The guarantee. A broken counter must never take down the wishlist page it is counting.
  it('never throws when the write fails for any other reason', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPrismaDb.visit.create.mockRejectedValue(new Error('database is locked'));

    await expect(recordVisit('p1', 2026)).resolves.toBeUndefined();
    // And it must be LOUD. A silently dropped write renders on the dashboard as a
    // confident "Never opened their link" for someone who did open it.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
