const mockDb = {
  person: { findUnique: jest.fn(), findMany: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: mockDb }));

import { getActiveDrawsForPerson } from '@/lib/draws';

beforeEach(() => jest.clearAllMocks());

test('returns all active same-email draws for a person with an email', async () => {
  mockDb.person.findUnique.mockResolvedValue({ id: 'p-1', email: 'boss@example.com' });
  mockDb.person.findMany.mockResolvedValue([
    { id: 'p-1', name: 'Chris', groupId: 'g-1', group: { name: 'Family Draw' } },
    { id: 'p-2', name: 'Chris', groupId: 'g-2', group: { name: 'Partner Draw' } },
  ]);
  const draws = await getActiveDrawsForPerson('p-1');
  expect(draws).toEqual([
    { personId: 'p-1', personName: 'Chris', groupId: 'g-1', groupName: 'Family Draw' },
    { personId: 'p-2', personName: 'Chris', groupId: 'g-2', groupName: 'Partner Draw' },
  ]);
  expect(mockDb.person.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { email: 'boss@example.com', active: true } }),
  );
});

test('returns [] and does not query siblings for a person with no email', async () => {
  mockDb.person.findUnique.mockResolvedValue({ id: 'p-3', email: null });
  expect(await getActiveDrawsForPerson('p-3')).toEqual([]);
  expect(mockDb.person.findMany).not.toHaveBeenCalled();
});

test('returns [] when the person no longer exists', async () => {
  mockDb.person.findUnique.mockResolvedValue(null);
  expect(await getActiveDrawsForPerson('gone')).toEqual([]);
});
