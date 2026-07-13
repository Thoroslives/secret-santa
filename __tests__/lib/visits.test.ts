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

import { recordVisit, VISIT_DEBOUNCE_MS } from '@/lib/visits';

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
  // half hour collides on @@unique([personId, bucket]) and the DATABASE throws it away.
  it('swallows the unique violation when they were already here this half hour', async () => {
    mockPrismaDb.visit.create.mockRejectedValue({ code: 'P2002' });

    await expect(recordVisit('p1', 2026)).resolves.toBeUndefined();
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
