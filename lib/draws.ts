import { prisma } from "@/lib/db";

export interface Draw {
  personId: string;
  personName: string;
  groupId: string;
  groupName: string;
}

// The set of draws a signed-in participant can switch between: every ACTIVE
// person that shares the CURRENT person's email. Derived live from the DB by
// personId (never from a cookie), so an email change or reassignment is
// reflected immediately and a stale cookie can never pivot into a reused email.
// A person with no email (or who no longer exists) has no switchable siblings.
export async function getActiveDrawsForPerson(personId: string): Promise<Draw[]> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person?.email) return [];

  const people = await prisma.person.findMany({
    where: { email: person.email, active: true },
    include: { group: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return people.map((p) => ({
    personId: p.id,
    personName: p.name,
    groupId: p.groupId,
    groupName: p.group.name,
  }));
}
