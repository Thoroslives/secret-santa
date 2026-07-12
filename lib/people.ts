import { prisma } from "@/lib/db";

export interface EmailHolder {
  id: string;
  name: string;
  groupId: string;
  groupName: string;
  active: boolean;
}

// Everyone who already holds `email`, in ANY group, EXCLUDING the rows about to be
// written. Backs the confirmation on both write paths (add a person, edit a person's
// email), because sharing an address is what makes two Person rows switchable siblings
// (lib/draws.ts) - i.e. it lets them open each other's draw and see each other's match.
// That is the intended way to give one human their several draws under one login, and it
// is the worst bug in the app when the two rows are different humans. So it is never
// blocked, only confirmed, and the caller shows the holders BY NAME so a mistyped address
// reads as an obvious name mismatch.
//
// Deliberately does NOT filter on `active`, even though getActiveDrawsForPerson() does.
// `active` is a mutable flag on an endpoint with no email check of its own, so an inactive
// holder skipped here would let the write through silently and the ordinary "reactivate
// person" button would then complete the merge for free.
//
// Returns only what the caller needs to recognise the person and to check group
// uniqueness. personalLinkToken is a login credential and must never travel in a
// confirmation payload.
export async function findEmailHolders(
  email: string,
  excludeIds: string[]
): Promise<EmailHolder[]> {
  // where: { email: null } compiles to IS NULL, which would match every person in the
  // database who has no address. A blank email has no holders, by definition.
  if (!email?.trim()) return [];

  const holders = await prisma.person.findMany({
    where: { email, id: { notIn: excludeIds } },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return holders.map((p) => ({
    id: p.id,
    name: p.name,
    groupId: p.groupId,
    groupName: p.group.name,
    active: p.active,
  }));
}

// Has the admin consented to link THESE people's draws? The acknowledgement is the exact
// set of holder ids the confirmation dialog rendered, not a bare "yes" boolean - so a
// stale retry, a client bug, or a hand-rolled API call cannot bless a merge that was
// never actually shown to anyone.
export function linkAcknowledged(linksTo: EmailHolder[], acknowledgedLinkIds: unknown): boolean {
  if (linksTo.length === 0) return true;
  if (!Array.isArray(acknowledgedLinkIds)) return false;

  const ack = new Set(acknowledgedLinkIds as string[]);
  return ack.size === linksTo.length && linksTo.every((l) => ack.has(l.id));
}
