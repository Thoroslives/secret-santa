const mockDb = {
  person: { findMany: jest.fn() },
};
jest.mock('@/lib/db', () => ({ prisma: mockDb }));

import { findEmailHolders } from '@/lib/people';

beforeEach(() => jest.clearAllMocks());

test('returns everyone already holding the address, in any group', async () => {
  mockDb.person.findMany.mockResolvedValue([
    { id: 'p-2', name: 'Alice', active: true, group: { name: 'Christmas 2027' } },
  ]);

  const holders = await findEmailHolders('alice@example.com', ['p-1']);

  expect(holders).toEqual([
    { id: 'p-2', name: 'Alice', groupName: 'Christmas 2027', active: true },
  ]);
});

// The whole point of the guard. lib/draws.ts only counts active people, so if this
// helper filtered on `active` too, an inactive holder would be skipped, the edit would
// save silently, and the ordinary "reactivate person" button (which has no email check)
// would complete the merge afterwards for free.
test('does NOT filter on active - an inactive holder still counts', async () => {
  mockDb.person.findMany.mockResolvedValue([
    { id: 'p-9', name: 'Yuki', active: false, group: { name: 'Christmas 2026' } },
  ]);

  const holders = await findEmailHolders('yuki@example.com', ['p-1']);

  expect(holders).toEqual([
    { id: 'p-9', name: 'Yuki', groupName: 'Christmas 2026', active: false },
  ]);
  expect(mockDb.person.findMany.mock.calls[0][0].where).not.toHaveProperty('active');
});

test('excludes the rows being written', async () => {
  mockDb.person.findMany.mockResolvedValue([]);

  await findEmailHolders('alice@example.com', ['p-1', 'p-2']);

  expect(mockDb.person.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { email: 'alice@example.com', id: { notIn: ['p-1', 'p-2'] } },
    }),
  );
});

// personalLinkToken is a login credential. It must never reach the admin's browser
// through a confirmation payload.
test('never exposes personalLinkToken', async () => {
  mockDb.person.findMany.mockResolvedValue([
    {
      id: 'p-2',
      name: 'Alice',
      active: true,
      personalLinkToken: 'super-secret-token',
      group: { name: 'Christmas 2027' },
    },
  ]);

  const holders = await findEmailHolders('alice@example.com', []);

  expect(holders[0]).not.toHaveProperty('personalLinkToken');
  expect(JSON.stringify(holders)).not.toContain('super-secret-token');
});

// where: { email: null } compiles to IS NULL, which would match every person in the
// database who has no email. Never query for a blank address.
test.each([null, undefined, '', '   '])(
  'returns [] without querying for a blank address (%p)',
  async (email) => {
    expect(await findEmailHolders(email as unknown as string, [])).toEqual([]);
    expect(mockDb.person.findMany).not.toHaveBeenCalled();
  },
);
