import type { CommitteeCreditStrategy } from "@/server/db/types";

export const COMMITTEE_CREDIT_COUNTS = [1, 2, 3] as const;

export function creditForMember(
  strategy: CommitteeCreditStrategy,
  activeCommitteeCount: number
): number {
  if (activeCommitteeCount <= 0) return 0;

  switch (strategy) {
    case "FULL_CREDIT":
      return 1;
    case "FRACTIONAL_CREDIT":
      return 1 / activeCommitteeCount;
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

export type CommitteeCreditShare = {
  committeeCount: number;
  creditPerCommittee: number;
  totalCredit: number;
};

/** How one attendance credits committees. Individual GH Points are never split. */
export function committeeCreditShare(
  strategy: CommitteeCreditStrategy,
  committeeCount: number
): CommitteeCreditShare {
  const creditPerCommittee = creditForMember(strategy, committeeCount);
  return {
    committeeCount,
    creditPerCommittee,
    totalCredit: creditPerCommittee * Math.max(committeeCount, 0),
  };
}

export function formatCredit(value: number): string {
  if (Math.abs(value - 1) < 1e-9) return "1";
  if (Math.abs(value - 0.5) < 1e-9) return "0,5";
  if (Math.abs(value - 1 / 3) < 1e-9) return "⅓";
  return value.toLocaleString("es-CO", { maximumFractionDigits: 3 });
}

export function participationRate(credit: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return credit / eligible;
}

export function averageRate(rates: number[]): number {
  if (rates.length === 0) return 0;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

export function roundRateDisplay(rate: number, decimals = 1): string {
  return (rate * 100).toFixed(decimals);
}

export function membershipActiveAt(
  joinedAt: Date,
  leftAt: Date | null,
  at: Date
): boolean {
  return joinedAt.getTime() <= at.getTime() && (leftAt === null || leftAt.getTime() > at.getTime());
}

export function snapshotEligibleCount(
  liveEligible: number,
  existing: { frozen: boolean; eligibleMemberCount: number } | null,
  shouldFreeze: boolean
): number {
  if (shouldFreeze && existing?.frozen) return existing.eligibleMemberCount;
  return liveEligible;
}

export type SnapshotAttendance = { memberId: string; registeredAt: Date };

export type SnapshotMembership = {
  memberId: string;
  committeeId: string;
  joinedAt: Date;
  leftAt: Date | null;
};

export type SnapshotCommittee = { id: string; liveEligibleCount: number };

export type ExistingSnapshot = { frozen: boolean; eligibleMemberCount: number };

export type CommitteeSnapshot = {
  committeeId: string;
  eligibleMemberCount: number;
  attendeeCredit: number;
  participationRate: number;
};

/**
 * Score de comité for one Actividad. Membership is read at Asistencia time
 * (ADR-007) and the multi-committee strategy comes from AppConfig (ADR-006).
 * Indexing memberships by Integrante keeps this linear in attendances instead
 * of committees × attendances × memberships.
 */
export function computeCommitteeSnapshots(input: {
  committees: SnapshotCommittee[];
  attendances: SnapshotAttendance[];
  memberships: SnapshotMembership[];
  existingByCommittee: ReadonlyMap<string, ExistingSnapshot>;
  strategy: CommitteeCreditStrategy;
  shouldFreeze: boolean;
}): CommitteeSnapshot[] {
  const membershipsByMember = new Map<string, SnapshotMembership[]>();
  for (const membership of input.memberships) {
    const bucket = membershipsByMember.get(membership.memberId);
    if (bucket) bucket.push(membership);
    else membershipsByMember.set(membership.memberId, [membership]);
  }

  const creditByCommittee = new Map<string, number>();
  for (const attendance of input.attendances) {
    const activeAtTime = (membershipsByMember.get(attendance.memberId) ?? []).filter(
      (membership) =>
        membershipActiveAt(membership.joinedAt, membership.leftAt, attendance.registeredAt)
    );
    const credit = creditForMember(input.strategy, activeAtTime.length);
    if (credit === 0) continue;
    for (const membership of activeAtTime) {
      creditByCommittee.set(
        membership.committeeId,
        (creditByCommittee.get(membership.committeeId) ?? 0) + credit
      );
    }
  }

  return input.committees.map((committee) => {
    const eligibleMemberCount = snapshotEligibleCount(
      committee.liveEligibleCount,
      input.existingByCommittee.get(committee.id) ?? null,
      input.shouldFreeze
    );
    const attendeeCredit = creditByCommittee.get(committee.id) ?? 0;
    return {
      committeeId: committee.id,
      eligibleMemberCount,
      attendeeCredit,
      participationRate: participationRate(attendeeCredit, eligibleMemberCount),
    };
  });
}
