import "server-only";

import { Prisma, type CommitteeCreditStrategy } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getCreditStrategy } from "@/server/config/app-config";
import {
  computeCommitteeSnapshots,
  type ExistingSnapshot,
} from "@/server/domain/scoring-pure";

function toDecimal(value: number) {
  return new Prisma.Decimal(value.toFixed(6));
}

export async function recomputeActivityScores(activityId: string) {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      seasonId: true,
      status: true,
      attendances: {
        where: { status: "APPROVED" },
        select: { memberId: true, registeredAt: true },
      },
    },
  });
  if (!activity) return;

  const shouldFreeze = activity.status === "CLOSED" || activity.status === "PROCESSED";
  const strategy = await getCreditStrategy();

  const [committees, eligibleCounts, existingScores] = await Promise.all([
    prisma.committee.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
      select: { id: true },
    }),
    prisma.memberCommittee.groupBy({
      by: ["committeeId"],
      where: { isActive: true, member: { status: "ACTIVE" } },
      _count: { _all: true },
    }),
    prisma.committeeActivityScore.findMany({
      where: { activityId },
      select: { committeeId: true, frozen: true, eligibleMemberCount: true },
    }),
  ]);

  const liveEligibleByCommittee = new Map(
    eligibleCounts.map((row) => [row.committeeId, row._count._all])
  );
  const existingByCommittee = new Map<string, ExistingSnapshot>(
    existingScores.map((score) => [
      score.committeeId,
      { frozen: score.frozen, eligibleMemberCount: score.eligibleMemberCount },
    ])
  );

  const approvedMemberIds = activity.attendances.map((row) => row.memberId);
  const memberships = approvedMemberIds.length
    ? await prisma.memberCommittee.findMany({
        where: { memberId: { in: approvedMemberIds } },
        select: { memberId: true, committeeId: true, joinedAt: true, leftAt: true },
      })
    : [];

  const computedAt = new Date();
  const snapshots = computeCommitteeSnapshots({
    committees: committees.map((committee) => ({
      id: committee.id,
      liveEligibleCount: liveEligibleByCommittee.get(committee.id) ?? 0,
    })),
    attendances: activity.attendances,
    memberships,
    existingByCommittee,
    strategy,
    shouldFreeze,
  });

  if (snapshots.length === 0) return;

  await prisma.$transaction(
    snapshots.map((snapshot) =>
      prisma.committeeActivityScore.upsert({
        where: {
          committeeId_activityId: { committeeId: snapshot.committeeId, activityId },
        },
        update: {
          seasonId: activity.seasonId,
          eligibleMemberCount: snapshot.eligibleMemberCount,
          attendeeCredit: toDecimal(snapshot.attendeeCredit),
          participationRate: toDecimal(snapshot.participationRate),
          creditStrategy: strategy,
          frozen: shouldFreeze,
          computedAt,
        },
        create: {
          committeeId: snapshot.committeeId,
          activityId,
          seasonId: activity.seasonId,
          eligibleMemberCount: snapshot.eligibleMemberCount,
          attendeeCredit: toDecimal(snapshot.attendeeCredit),
          participationRate: toDecimal(snapshot.participationRate),
          creditStrategy: strategy,
          frozen: shouldFreeze,
        },
      })
    )
  );
}

export async function recomputeSeasonScores(seasonId: string) {
  const activities = await prisma.activity.findMany({
    where: { seasonId, status: { in: ["OPEN", "CLOSED", "PROCESSED"] } },
    select: { id: true },
  });
  for (const activity of activities) {
    await recomputeActivityScores(activity.id);
  }
}

export async function listActivityCommitteeScores(activityId: string) {
  return prisma.committeeActivityScore.findMany({
    where: { activityId },
    include: { committee: true },
    orderBy: { participationRate: "desc" },
  });
}

export function snapshotStrategyLabel(strategy: CommitteeCreditStrategy): string {
  switch (strategy) {
    case "FULL_CREDIT":
      return "Crédito completo (FULL_CREDIT)";
    case "FRACTIONAL_CREDIT":
      return "Crédito fraccionado (FRACTIONAL_CREDIT)";
    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}
