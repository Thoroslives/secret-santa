import { prisma } from "@/lib/db";

/**
 * Find or create the Round for a group's year. A Round is the home for a draw's
 * status (draft -> generated -> sent); forced pins and the generate flow both
 * need it to exist, so this is the single place that materializes it. Kept in
 * one helper so pins and generate can't drift on how a round comes into being.
 */
export async function ensureRound(groupId: string, year: number) {
  const existing = await prisma.round.findUnique({
    where: { groupId_year: { groupId, year } },
  });
  if (existing) return existing;
  return prisma.round.create({ data: { groupId, year } });
}
