import "server-only";

import { after } from "next/server";
import { db } from "@/server/db/prisma";
import { isoNow } from "@/server/db/time";

/**
 * Expired auth rows are dead weight: sessions are unusable once past
 * `expiresAt`, and challenges only matter to the login window.
 *
 * Challenges are kept far longer than they are valid on purpose — the OTP rate
 * limit counts rows from the last 15 minutes, so deleting merely-expired rows
 * would hand an attacker a fresh budget.
 */
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 60 * 1000;

let lastRunAt = 0;

export async function pruneExpiredAuthRows() {
  const now = Date.now();
  const challengeCutoff = new Date(now - CHALLENGE_RETENTION_MS).toISOString();
  const [sessions, challenges] = await Promise.all([
    db.orm.public.Session.where((session) => session.expiresAt.lt(isoNow())).deleteAndCount(),
    db.orm.public.AuthChallenge.where((row) => row.createdAt.lt(challengeCutoff)).deleteAndCount(),
  ]);
  return { sessions, challenges };
}

/** Fire-and-forget prune, at most once an hour per process. */
export function schedulePruneExpiredAuthRows(): void {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;

  const run = () => pruneExpiredAuthRows().catch(reportPruneFailure);
  try {
    after(run);
  } catch {
    void run();
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fire-and-forget catch boundary
function reportPruneFailure(error: unknown): void {
  console.error("[auth-prune] failed", error);
}
