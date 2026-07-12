import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// A transactionally consistent copy of the SQLite database, taken over the live
// connection before anything irreversible.
//
// NOT a file copy. `docker-entrypoint.sh` can safely `cp` the DB because it runs
// BEFORE `node server.js`, with the database quiescent. A route runs while the server
// is handling other requests, and Prisma's SQLite connector leaves the default
// rollback journal in place - so a `cp` from in here can capture a half-applied
// transaction and produce a backup that looks fine and will not open. VACUUM INTO is
// the online-safe primitive (SQLite 3.27+): one statement, a consistent point-in-time
// image, and a file that reopens cleanly.
//
// The `predelete-` prefix is deliberate and must not become `bak-`: the entrypoint
// prunes `santa.db.bak-*` to the 5 newest on every container start, so a `bak-`-named
// rescue copy would be rotated away by a few restarts - precisely the panic path after
// deleting the wrong thing.
export async function snapshotDatabase(label: string): Promise<string> {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL is not a file: URL - cannot snapshot");
  }
  const dbPath = url.slice("file:".length);
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "") || "snapshot";
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const target = `${dbPath}.predelete-${safeLabel}-${stamp}`;

  await prisma.$executeRawUnsafe(`VACUUM INTO '${target}'`);
  return target;
}

export type SnapshotResult =
  | { ok: true; path: string }
  | { ok: false; refusal: NextResponse };

/**
 * Snapshot, or refuse to proceed. The guard shape mirrors `requireAdmin()` in lib/admin.ts:
 * the caller gets back either the path or the response to return, and cannot accidentally
 * carry on.
 *
 * The whole contract is FAIL CLOSED - a snapshot that did not happen must STOP the
 * destructive operation, because it is the only rollback that exists. Hand-copying that
 * try/catch into every destructive route is two chances to get the polarity backwards on
 * the two endpoints where being wrong is unrecoverable, so it lives here once.
 *
 * `noun` completes the sentence "..., so the <noun>." e.g. "group was NOT deleted".
 */
export async function snapshotOrRefuse(label: string, noun: string): Promise<SnapshotResult> {
  try {
    return { ok: true, path: await snapshotDatabase(label) };
  } catch (error) {
    console.error(`Pre-delete snapshot failed, refusing to proceed (${label}):`, error);
    return {
      ok: false,
      refusal: NextResponse.json(
        { error: `Could not take a safety snapshot of the database, so the ${noun}.` },
        { status: 503 }
      ),
    };
  }
}
