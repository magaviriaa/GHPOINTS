import "server-only";

import type { CommitteeCreditStrategy } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { isoNow, toDate, toDecimal } from "@/server/db/time";
import { getCreditStrategy } from "@/server/config/app-config";
import {
  computeCommitteeSnapshots,
  type ExistingSnapshot,
} from "@/server/domain/scoring-pure";

export async function recomputeActivityScores(activityId: string) {
  const activity = await db.orm.public.Activity.where({ id: activityId })
    .select("id", "seasonId", "status")
    .include("attendances", (attendances) =>
      attendances.where({ status: "APPROVED" }).select("memberId", "registeredAt")
    )
    .first();
  if (!activity) return;

  const shouldFreeze = activity.status === "CLOSED" || activity.status === "PROCESSED";
  const strategy = await getCreditStrategy();

  const activeMembers = await db.orm.public.Member.where({ status: "ACTIVE" }).select("id").all();
  const activeMemberIds = activeMembers.map((member) => member.id);

  const [committees, eligibleCounts, existingScores] = await Promise.all([
    db.orm.public.Committee.where({ status: "ACTIVE" })
      .orderBy((committee) => committee.id.asc())
      .select("id")
      .all(),
    activeMemberIds.length === 0
      ? Promise.resolve([])
      : db.orm.public.MemberCommittee.where({ isActive: true })
          .where((membership) => membership.memberId.in(activeMemberIds))
          .groupBy("committeeId")
          .aggregate((aggregate) => ({ total: aggregate.count() })),
    db.orm.public.CommitteeActivityScore.where({ activityId })
      .select("committeeId", "frozen", "eligibleMemberCount")
      .all(),
  ]);

  const liveEligibleByCommittee = new Map(
    eligibleCounts.map((row) => [row.committeeId, row.total])
  );
  const existingByCommittee = new Map<string, ExistingSnapshot>(
    existingScores.map((score) => [
      score.committeeId,
      { frozen: score.frozen, eligibleMemberCount: score.eligibleMemberCount },
    ])
  );

  const approvedMemberIds = activity.attendances.map((row) => row.memberId);
  const memberships = approvedMemberIds.length
    ? await db.orm.public.MemberCommittee.where((membership) =>
        membership.memberId.in(approvedMemberIds)
      )
        .select("memberId", "committeeId", "joinedAt", "leftAt")
        .all()
    : [];

  const computedAt = isoNow();
  const snapshots = computeCommitteeSnapshots({
    committees: committees.map((committee) => ({
      id: committee.id,
      liveEligibleCount: liveEligibleByCommittee.get(committee.id) ?? 0,
    })),
    attendances: activity.attendances.map((row) => ({
      memberId: row.memberId,
      registeredAt: toDate(row.registeredAt),
    })),
    memberships: memberships.map((membership) => ({
      memberId: membership.memberId,
      committeeId: membership.committeeId,
      joinedAt: toDate(membership.joinedAt),
      leftAt: membership.leftAt ? toDate(membership.leftAt) : null,
    })),
    existingByCommittee,
    strategy,
    shouldFreeze,
  });

  if (snapshots.length === 0) return;

  await db.transaction(async (tx) => {
    for (const snapshot of snapshots) {
      await tx.orm.public.CommitteeActivityScore.upsert({
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
        update: {
          seasonId: activity.seasonId,
          eligibleMemberCount: snapshot.eligibleMemberCount,
          attendeeCredit: toDecimal(snapshot.attendeeCredit),
          participationRate: toDecimal(snapshot.participationRate),
          creditStrategy: strategy,
          frozen: shouldFreeze,
          computedAt,
        },
        conflictOn: { committeeId: snapshot.committeeId, activityId },
      });
    }
  });
}

export async function recomputeSeasonScores(seasonId: string) {
  const activities = await db.orm.public.Activity.where({ seasonId })
    .where((activity) => activity.status.in(["OPEN", "CLOSED", "PROCESSED"]))
    .select("id")
    .all();
  for (const activity of activities) {
    await recomputeActivityScores(activity.id);
  }
}

export async function listActivityCommitteeScores(activityId: string) {
  return db.orm.public.CommitteeActivityScore.where({ activityId })
    .select("id", "attendeeCredit", "eligibleMemberCount", "participationRate")
    .include("committee", (committee) => committee.select("id", "name", "color"))
    .orderBy((score) => score.participationRate.desc())
    .all();
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
