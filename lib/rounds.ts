import { prisma } from "@/lib/db";

/**
 * Find or create the Round for a group's year. A Round is the home for a draw's
 * status (draft -> generated -> sent); forced pins and the generate flow both
 * need it to exist, so this is the single place that materializes it. Kept in
 * one helper so pins and generate can't drift on how a round comes into being.
 * Atomic upsert (not find-then-create) since participants can now reach this
 * via suggestions and could otherwise race the admin's generate call.
 */
export async function ensureRound(groupId: string, year: number) {
  return prisma.round.upsert({
    where: { groupId_year: { groupId, year } },
    update: {},
    create: { groupId, year },
  });
}

/**
 * Read a group's round for a year WITHOUT creating one. `ensureRound` is an upsert, so
 * it must never be used to answer a question - a read path that called it would
 * materialize a Round row as a side effect. Kept here beside it so the composite-key
 * literal for @@unique([groupId, year]) lives in one place.
 */
export async function getRound(groupId: string, year: number) {
  return prisma.round.findUnique({ where: { groupId_year: { groupId, year } } });
}

/**
 * Putting a round back to "no draw yet". `sentAt` MUST be cleared alongside the status:
 * it is the record that emails went out, and the destructive routes branch on it to
 * decide whether to take a database snapshot first. A reset that left a stale `sentAt`
 * behind would quietly make every later delete snapshot the database forever.
 */
export const RESET_TO_DRAFT = { status: "draft", sentAt: null } as const;

/**
 * The single source of truth for "the current cycle". Group.year is the
 * active-year pointer; every current-cycle route resolves the year from here
 * server-side instead of trusting a client-supplied year (A3/A4 rollover
 * moves this pointer forward; this is what makes that move take effect
 * everywhere at once).
 */
export async function getActiveYear(groupId: string): Promise<number> {
  const group = await prisma.group.findUnique({ where: { id: groupId }, select: { year: true } });
  if (!group) throw new Error(`Group ${groupId} not found`);
  return group.year;
}

/**
 * Pairs from the last `memory` rounds, so the draw engine can exclude a
 * repeat of someone's recent giftee (PREVIOUS_YEAR_MEMORY). Round-based, not
 * calendar arithmetic - "last N rounds" honours groups that skipped a year.
 */
export async function getPreviousYearExclusions(
  groupId: string,
  activeYear: number,
  memory: number
): Promise<Array<{ giverId: string; receiverId: string }>> {
  if (memory <= 0) return [];
  const priorRounds = await prisma.round.findMany({
    where: { groupId, year: { lt: activeYear }, assignments: { some: {} } },
    orderBy: { year: "desc" },
    take: memory,
    select: { id: true },
  });
  if (priorRounds.length === 0) return [];
  const assignments = await prisma.assignment.findMany({
    where: { roundId: { in: priorRounds.map((r) => r.id) } },
    select: { giverId: true, receiverId: true },
  });
  return assignments.map((a) => ({ giverId: a.giverId, receiverId: a.receiverId }));
}
