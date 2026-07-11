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
