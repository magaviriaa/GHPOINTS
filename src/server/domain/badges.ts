import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";
import { db } from "@/server/db/prisma";
import { isUniqueConstraint } from "@/server/db/errors";
import {
  BADGE_SLUGS,
  consecutiveActivityStreak,
  earnsPointsBadge,
  earnsStreakBadge,
  earnsTopBadge,
  monthlyMvpMemberIds,
} from "@/server/domain/badges-pure";
import { getIndividualRanking, getMemberBoardPosition } from "@/server/domain/ranking";
import { yearMonthKey } from "@/lib/dates";

type Award = {
  memberId: string;
  badgeId: string;
  seasonId: string;
  periodKey: string;
};

async function badgeIdBySlug(): Promise<Map<string, string>> {
  const badges = await db.orm.public.Badge.all();
  return new Map(badges.map((badge) => [badge.slug, badge.id]));
}

async function insertAwards(awards: Award[]) {
  if (awards.length === 0) return;
  for (const award of awards) {
    try {
      await db.orm.public.MemberBadge.create(award);
    } catch (error) {
      if (!isUniqueConstraint(error)) throw error;
    }
  }
}

/**
 * Rank-derived badges for one Integrante. Asks the Ranking module for a
 * position instead of materialising four boards to read one row.
 *
 * MVP spans both boards, so the month position is queried without `board` —
 * rank 1 with a positive total is exactly `monthlyMvpMemberIds` for one person.
 */
async function rankBadgesForMember(input: {
  memberId: string;
  seasonId: string;
  topId?: string;
  mvpId?: string;
}): Promise<Award[]> {
  const member = await db.orm.public.Member.where({ id: input.memberId })
    .select("memberType", "status")
    .first();
  if (!member || member.status !== "ACTIVE") return [];

  const awards: Award[] = [];

  if (input.topId) {
    const position = await getMemberBoardPosition({
      memberId: input.memberId,
      board: member.memberType,
      seasonId: input.seasonId,
      period: "season",
    });
    if (position?.rank !== null && position !== null && earnsTopBadge(position.rank)) {
      awards.push({
        memberId: input.memberId,
        badgeId: input.topId,
        seasonId: input.seasonId,
        periodKey: "",
      });
    }
  }

  if (input.mvpId) {
    const position = await getMemberBoardPosition({
      memberId: input.memberId,
      seasonId: input.seasonId,
      period: "month",
    });
    if (position && position.rank === 1 && position.total > 0) {
      awards.push({
        memberId: input.memberId,
        badgeId: input.mvpId,
        seasonId: input.seasonId,
        periodKey: yearMonthKey(new Date()),
      });
    }
  }

  return awards;
}

/** Same badges for everyone on the boards; here the whole board is the point. */
async function rankBadgesForSeason(input: {
  seasonId: string;
  topId?: string;
  mvpId?: string;
}): Promise<Award[]> {
  const awards: Award[] = [];

  if (input.topId) {
    const [activeBoard, newBoard] = await Promise.all([
      getIndividualRanking({ board: "ACTIVE", seasonId: input.seasonId, period: "season" }),
      getIndividualRanking({ board: "NEW", seasonId: input.seasonId, period: "season" }),
    ]);
    for (const entry of [...activeBoard.entries, ...newBoard.entries]) {
      if (earnsTopBadge(entry.rank)) {
        awards.push({
          memberId: entry.memberId,
          badgeId: input.topId,
          seasonId: input.seasonId,
          periodKey: "",
        });
      }
    }
  }

  if (input.mvpId) {
    const month = yearMonthKey(new Date());
    const [activeMonth, newMonth] = await Promise.all([
      getIndividualRanking({ board: "ACTIVE", seasonId: input.seasonId, period: "month" }),
      getIndividualRanking({ board: "NEW", seasonId: input.seasonId, period: "month" }),
    ]);
    const winners = monthlyMvpMemberIds([
      ...activeMonth.entries.map((entry) => ({ memberId: entry.memberId, total: entry.total })),
      ...newMonth.entries.map((entry) => ({ memberId: entry.memberId, total: entry.total })),
    ]);
    for (const memberId of winners) {
      awards.push({
        memberId,
        badgeId: input.mvpId,
        seasonId: input.seasonId,
        periodKey: month,
      });
    }
  }

  return awards;
}

export async function refreshBadges(input: { seasonId: string; memberId?: string }) {
  const ids = await badgeIdBySlug();
  const awards: Award[] = [];

  const streakId = ids.get(BADGE_SLUGS.STREAK);
  const pointsId = ids.get(BADGE_SLUGS.POINTS_500);
  const topId = ids.get(BADGE_SLUGS.TOP_10);
  const mvpId = ids.get(BADGE_SLUGS.MONTHLY_MVP);
  const leaderId = ids.get(BADGE_SLUGS.LEADER);

  const activities = await db.orm.public.Activity.where({ seasonId: input.seasonId })
    .where((activity) => activity.status.in(["OPEN", "CLOSED", "PROCESSED"]))
    .select("id", "startsAt")
    .orderBy((activity) => activity.startsAt.desc())
    .all();

  let approvedQuery = db.orm.public.Attendance.where({ status: "APPROVED" }).where((attendance) =>
    attendance.activity.some((activity) =>
      and(
        activity.seasonId.eq(input.seasonId),
        activity.status.in(["OPEN", "CLOSED", "PROCESSED"])
      )
    )
  );
  if (input.memberId) {
    approvedQuery = approvedQuery.where({ memberId: input.memberId });
  }

  const approved = await approvedQuery.select("memberId", "activityId").all();

  const attendedByMember = new Map<string, Set<string>>();
  for (const row of approved) {
    const set = attendedByMember.get(row.memberId) ?? new Set<string>();
    set.add(row.activityId);
    attendedByMember.set(row.memberId, set);
  }

  let totalsQuery = db.orm.public.PointTransaction.where({ seasonId: input.seasonId });
  if (input.memberId) {
    totalsQuery = totalsQuery.where({ memberId: input.memberId });
  } else {
    totalsQuery = totalsQuery.where((row) =>
      row.member.some((member) => member.status.eq("ACTIVE"))
    );
  }

  const totals = await totalsQuery.groupBy("memberId").aggregate((agg) => ({ total: agg.sum("points") }));

  if (streakId) {
    const memberIds =
      input.memberId !== undefined ? [input.memberId] : Array.from(attendedByMember.keys());
    for (const memberId of memberIds) {
      const attended = attendedByMember.get(memberId) ?? new Set<string>();
      const streak = consecutiveActivityStreak(activities, attended);
      if (earnsStreakBadge(streak)) {
        awards.push({
          memberId,
          badgeId: streakId,
          seasonId: input.seasonId,
          periodKey: "",
        });
      }
    }
  }

  if (pointsId) {
    for (const row of totals) {
      if (earnsPointsBadge(row.total ?? 0)) {
        awards.push({
          memberId: row.memberId,
          badgeId: pointsId,
          seasonId: input.seasonId,
          periodKey: "",
        });
      }
    }
  }

  if (input.memberId) {
    awards.push(
      ...(await rankBadgesForMember({
        memberId: input.memberId,
        seasonId: input.seasonId,
        topId,
        mvpId,
      }))
    );
  } else {
    awards.push(...(await rankBadgesForSeason({ seasonId: input.seasonId, topId, mvpId })));
  }

  if (leaderId) {
    let leadersQuery = db.orm.public.MemberRole.where({ role: "COMMITTEE_LEADER" });
    if (input.memberId) {
      leadersQuery = leadersQuery.where({ memberId: input.memberId });
    } else {
      leadersQuery = leadersQuery.where((row) =>
        row.member.some((member) => member.status.eq("ACTIVE"))
      );
    }
    const leaders = await leadersQuery.select("memberId").all();
    const uniqueLeaders = new Set(leaders.map((row) => row.memberId));
    for (const memberId of uniqueLeaders) {
      awards.push({
        memberId,
        badgeId: leaderId,
        seasonId: input.seasonId,
        periodKey: "",
      });
    }
  }

  await insertAwards(awards);
}

export { BADGE_SLUGS };
