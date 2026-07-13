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
// The cost of a tumbling window rather than a sliding one: a refresh that straddles the
// half-hour boundary counts twice. That is a good trade for atomicity, and it is the only
// way this number is wrong.
export const VISIT_DEBOUNCE_MS = 30 * 60 * 1000;

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
