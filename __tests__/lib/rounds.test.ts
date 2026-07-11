// ---------------------------------------------------------------------------
// Tests for the REAL lib/rounds.ts logic. routes.test.ts mocks '@/lib/rounds'
// wholesale so route handlers never reach this code - this file is the only
// place ensureRound/getActiveYear's actual behaviour is exercised. Mock
// '@/lib/db' locally the same way routes.test.ts does (see its lines 1-58),
// NOT '@/lib/rounds' itself.
// ---------------------------------------------------------------------------
const mockPrismaDb = {
  group: {
    findUnique: jest.fn(),
  },
  round: {
    upsert: jest.fn(),
  },
};

jest.mock('@/lib/db', () => ({
  prisma: mockPrismaDb,
}));

import { ensureRound, getActiveYear } from '@/lib/rounds';

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// getActiveYear - Group.year is the active-year source of truth
// ===========================================================================
describe('getActiveYear', () => {
  it("returns the group's year", async () => {
    mockPrismaDb.group.findUnique.mockResolvedValue({ year: 2027 });

    const year = await getActiveYear('group-1');

    expect(year).toBe(2027);
    expect(mockPrismaDb.group.findUnique).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      select: { year: true },
    });
  });

  it('throws when the group does not exist', async () => {
    mockPrismaDb.group.findUnique.mockResolvedValue(null);

    await expect(getActiveYear('missing-group')).rejects.toThrow('Group missing-group not found');
  });
});

// ===========================================================================
// ensureRound - atomic upsert (was find-then-create; participants can now
// race it via suggestions, so the DB does the atomicity, not app code).
// ===========================================================================
describe('ensureRound', () => {
  it('upserts the round keyed by (groupId, year) and returns it', async () => {
    const round = { id: 'round-1', groupId: 'group-1', year: 2027, status: 'draft' };
    mockPrismaDb.round.upsert.mockResolvedValue(round);

    const result = await ensureRound('group-1', 2027);

    expect(result).toEqual(round);
    expect(mockPrismaDb.round.upsert).toHaveBeenCalledWith({
      where: { groupId_year: { groupId: 'group-1', year: 2027 } },
      update: {},
      create: { groupId: 'group-1', year: 2027 },
    });
  });

  it('returns the existing round unchanged when one already exists (update is a no-op)', async () => {
    const existing = { id: 'round-1', groupId: 'group-1', year: 2027, status: 'sent' };
    mockPrismaDb.round.upsert.mockResolvedValue(existing);

    const result = await ensureRound('group-1', 2027);

    expect(result).toEqual(existing);
    // the `update: {}` clause must never overwrite a status a generate/send
    // flow already advanced - upsert only touches fields it's told to.
    expect(mockPrismaDb.round.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    );
  });
});
