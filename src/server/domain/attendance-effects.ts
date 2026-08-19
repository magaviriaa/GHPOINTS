import "server-only";

import { after } from "next/server";
import { recomputeActivityScores } from "@/server/domain/scoring";
import { refreshBadges } from "@/server/domain/badges";

export type AttendanceEffectsInput = {
  activityId: string;
  seasonId: string;
  memberId?: string;
};

type Slot = { running: Promise<void>; rerun: boolean };

const slots = new Map<string, Slot>();

/**
 * Runs `task` once per key. Callers arriving while a run is in flight join it and
 * mark one more pass, so N concurrent QR scans on the same Actividad collapse into
 * at most two recomputes instead of N.
 */
function runCoalesced(key: string, task: () => Promise<void>): Promise<void> {
  const existing = slots.get(key);
  if (existing) {
    existing.rerun = true;
    return existing.running;
  }

  const slot: Slot = { rerun: false, running: Promise.resolve() };
  slots.set(key, slot);
  slot.running = (async () => {
    try {
      do {
        slot.rerun = false;
        await task();
      } while (slot.rerun);
    } finally {
      slots.delete(key);
    }
  })();
  return slot.running;
}

/** Awaited variant: Score de comité and badges are current when it resolves. */
export async function runAttendanceEffects(input: AttendanceEffectsInput): Promise<void> {
  await runCoalesced(`scores:${input.activityId}`, () =>
    recomputeActivityScores(input.activityId)
  );
  await runCoalesced(badgeKey(input), () =>
    refreshBadges({ seasonId: input.seasonId, memberId: input.memberId })
  );
}

/**
 * Post-commit variant for the registration path. The Asistencia and its Ledger row
 * are already committed; Score de comité and badges catch up right after the
 * response (ADR-021). Delivery failures never surface to the Integrante.
 */
export function scheduleAttendanceEffects(input: AttendanceEffectsInput): void {
  try {
    after(() => runAttendanceEffects(input).catch(reportEffectsFailure));
  } catch {
    // Outside a request scope (tests, scripts): fall back to fire-and-forget.
    void runAttendanceEffects(input).catch(reportEffectsFailure);
  }
}

function badgeKey(input: AttendanceEffectsInput): string {
  return input.memberId
    ? `badges:${input.seasonId}:${input.memberId}`
    : `badges:${input.seasonId}`;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fire-and-forget catch boundary
function reportEffectsFailure(error: unknown): void {
  console.error("[attendance-effects] recompute failed", error);
}
