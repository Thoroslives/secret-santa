import { prisma } from "@/lib/db";

// One visit per person per 30 minutes, enforced by a UNIQUE KEY rather than by reading
// first and then deciding.
//
// The bucket is floor(now / 30min), so every request inside the same half hour computes
// the same number and the second one collides on @@unique([personId, bucket]). The
// database does the debouncing. Two reasons that shape matters here:
//
//   1. It is ATOMIC. A findFirst-then-create lets two concurrent page loads both see
//      "no recent visit" and both insert, which is exactly what a burst looks like.
//   2. It is ONE lock, not two. This database runs on SQLite's DEFAULT ROLLBACK JOURNAL
//      (see lib/db-snapshot.ts), where a writer takes an EXCLUSIVE lock that blocks every
//      reader. Every lock this feature adds to the participant hot path is a lock every
//      other participant waits behind, and the moment that bites is the moment the admin
//      hits Send and the whole family opens their email at once.
//
// Do NOT "fix" the locking by switching SQLite to WAL: docker-entrypoint.sh backs the live
// database up with a plain `cp`, which is only safe because there is no WAL sidecar, and
// that backup is the only rollback the deploy has.
//
// BE HONEST ABOUT WHAT THIS COUNTS. The bucket is a TUMBLING window anchored on the epoch,
// not a SLIDING one anchored on the person's last visit, and the difference is not only the
// refresh case:
//
//   - Two loads either side of :00 or :30 count twice however close they are. 10:29 and 10:31
//     is two visits, two minutes apart.
//   - One continuous sitting from 10:50 to 11:40 lands in three buckets and counts as three.
//
// So the number means "half-hour buckets in which they opened the page", which is a good
// proxy for sittings and a poor one for a long browse. It is biased upward, and most upward
// for the engaged reader this feature most wants to notice. A sliding window would read
// slightly truer, but it needs a read-then-write, which is neither atomic nor a single lock -
// and on this database that trade is not worth a nicer number.
export const VISIT_DEBOUNCE_MS = 30 * 60 * 1000;

// "Recent" on the dashboard. Coarse on purpose: the admin is asking "are they still around",
// not "exactly how often".
export const RECENT_VISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function recordVisit(personId: string, year: number): Promise<void> {
  try {
    await prisma.visit.create({
      data: { personId, year, bucket: Math.floor(Date.now() / VISIT_DEBOUNCE_MS) },
    });
  } catch (error) {
    // P2002 = unique violation = they were already here this half hour. Expected, not a fault.
    if ((error as { code?: string }).code === "P2002") return;

    // Anything else: swallow, because analytics must never take down the page it is
    // measuring. But log it LOUDLY. A silently dropped write renders on the dashboard as a
    // confident "Never opened their link", which would send the admin chasing a family
    // member who did in fact open it. A visible error beats a plausible lie.
    console.error("Failed to record visit:", error);
  }
}

export interface VisitSummary {
  visitCount: number;
  lastVisitAt: Date | null;
  recentVisits: number;
}

// The read side, living next to the write it summarises (the same way lib/rounds.ts keeps
// ensureRound and getRound together).
//
// ONE query, not two or three DB-side aggregates. At roughly a thousand rows a season there
// is nothing to avoid pulling, and a single pass over the rows yields all three numbers -
// which also means one fewer lock taken against a single-file SQLite database.
//
// Callers get a Map with no entry for someone who has never visited. That is deliberate: the
// caller decides what absence means, and on the dashboard it must render as a real 0, never
// as "no data". Someone who has never opened their link is the most important row on the page.
export async function getVisitSummaries(
  personIds: string[],
  year: number
): Promise<Map<string, VisitSummary>> {
  const visits = await prisma.visit.findMany({
    where: { personId: { in: personIds }, year },
    select: { personId: true, createdAt: true },
  });

  const recentSince = new Date(Date.now() - RECENT_VISIT_WINDOW_MS);
  const summaries = new Map<string, VisitSummary>();

  for (const visit of visits) {
    const summary = summaries.get(visit.personId) ?? {
      visitCount: 0,
      lastVisitAt: null,
      recentVisits: 0,
    };

    summary.visitCount += 1;
    if (!summary.lastVisitAt || visit.createdAt > summary.lastVisitAt) {
      summary.lastVisitAt = visit.createdAt;
    }
    if (visit.createdAt > recentSince) summary.recentVisits += 1;

    summaries.set(visit.personId, summary);
  }

  return summaries;
}
