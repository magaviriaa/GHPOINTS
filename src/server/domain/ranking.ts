import "server-only";

import type { MemberType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  parseRankingPeriod,
  rankingWindow,
  withCompetitionRanks,
  type RankingPeriod,
} from "@/server/domain/ranking-pure";
import { averageRate } from "@/server/domain/scoring-pure";
import { resolveSeason } from "@/server/domain/season";

export async function getIndividualRanking(input: {
  board: MemberType;
  period?: RankingPeriod | string;
  isoWeek?: string;
  seasonId?: string;
  limit?: number;
}) {
  const season = await resolveSeason(input.seasonId);
  if (!season) return { season: null, entries: [] };

  const period = parseRankingPeriod(input.period);
  const window = rankingWindow(period, { isoWeek: input.isoWeek });
  let createdAt: { gte: Date; lt?: Date } | undefined;
  if (window) {
    createdAt = { gte: window.gte };
    if (window.lt !== null) createdAt.lt = window.lt;
  }

  const grouped = await prisma.pointTransaction.groupBy({
    by: ["memberId"],
    where: {
      seasonId: season.id,
      createdAt,
      member: { status: "ACTIVE", memberType: input.board },
    },
    _sum: { points: true },
  });

  const members = await prisma.member.findMany({
    where: {
      id: { in: grouped.map((row) => row.memberId) },
      status: "ACTIVE",
      memberType: input.board,
    },
    include: {
      committees: {
        where: { isActive: true },
        include: { committee: { select: { name: true, slug: true, color: true } } },
      },
    },
  });

  const memberById = new Map(members.map((member) => [member.id, member]));
  const ranked = withCompetitionRanks(
    grouped
      .map((row) => {
        const member = memberById.get(row.memberId);
        if (!member) return null;
        return {
          memberId: member.id,
          fullName: member.fullName,
          memberType: member.memberType,
          total: row._sum.points ?? 0,
          committees: member.committees.map((item) => item.committee),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
    (left, right) => left.fullName.localeCompare(right.fullName, "es")
  );

  return {
    season,
    period,
    entries: input.limit === undefined ? ranked : ranked.slice(0, input.limit),
  };
}

type BoardPositionRow = {
  member_total: number | null;
  above: number;
  board_size: number;
};

/**
 * Position of one Integrante without materialising the board.
 *
 * `rank = 1 + (integrantes con total estrictamente mayor)` is the same
 * competition ranking as `withCompetitionRanks` (1, 2, 2, 4), asserted in the
 * unit tests. An Integrante with no rows in the window is off the board and
 * gets `rank: null`, matching what the full board returns today.
 *
 * `board` omitted spans both boards — that is the shape the monthly MVP badge
 * needs, since it compares NEW and ACTIVE together.
 */
export async function getMemberBoardPosition(input: {
  memberId: string;
  board?: MemberType;
  seasonId?: string;
  period?: RankingPeriod | string;
  isoWeek?: string;
}) {
  const season = await resolveSeason(input.seasonId);
  if (!season) return null;

  const period = parseRankingPeriod(input.period);
  const window = rankingWindow(period, { isoWeek: input.isoWeek });
  const from = window?.gte ?? new Date(0);
  const to = window?.lt ?? null;
  const board = input.board ?? null;

  const rows = await prisma.$queryRaw<BoardPositionRow[]>`
    WITH totals AS (
      SELECT pt."memberId" AS member_id, SUM(pt.points)::int AS total
      FROM "PointTransaction" pt
      JOIN "Member" m ON m.id = pt."memberId"
      WHERE pt."seasonId" = ${season.id}
        AND m.status = 'ACTIVE'
        AND (${board}::text IS NULL OR m."memberType"::text = ${board}::text)
        AND pt."createdAt" >= ${from}
        AND (${to}::timestamp IS NULL OR pt."createdAt" < ${to}::timestamp)
      GROUP BY pt."memberId"
    ),
    mine AS (
      SELECT total FROM totals WHERE member_id = ${input.memberId}
    )
    SELECT
      (SELECT total FROM mine) AS member_total,
      (SELECT COUNT(*)::int FROM totals WHERE total > (SELECT total FROM mine)) AS above,
      (SELECT COUNT(*)::int FROM totals) AS board_size
  `;

  const row = rows[0];
  const total = row?.member_total ?? null;
  return {
    season,
    period,
    total: total ?? 0,
    rank: total === null ? null : (row?.above ?? 0) + 1,
    boardSize: row?.board_size ?? 0,
  };
}

export async function getMemberSeasonStanding(memberId: string, seasonId?: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { memberType: true },
  });
  if (!member) return null;

  const position = await getMemberBoardPosition({
    memberId,
    board: member.memberType,
    seasonId,
    period: "season",
  });

  return {
    season: position?.season ?? null,
    total: position?.total ?? 0,
    rank: position?.rank ?? null,
    boardSize: position?.boardSize ?? 0,
    memberType: member.memberType,
  };
}

export async function getCommitteeSeasonScores(seasonId: string) {
  const scores = await prisma.committeeActivityScore.findMany({
    where: {
      seasonId,
      activity: { status: { in: ["CLOSED", "PROCESSED"] } },
    },
    include: {
      committee: true,
    },
  });

  const byCommittee = new Map<
    string,
    {
      committeeId: string;
      name: string;
      slug: string;
      color: string;
      status: string;
      rates: number[];
      activities: number;
    }
  >();

  for (const score of scores) {
    const current = byCommittee.get(score.committeeId) ?? {
      committeeId: score.committeeId,
      name: score.committee.name,
      slug: score.committee.slug,
      color: score.committee.color,
      status: score.committee.status,
      rates: [],
      activities: 0,
    };
    current.rates.push(Number(score.participationRate));
    current.activities += 1;
    byCommittee.set(score.committeeId, current);
  }

  const committees = await prisma.committee.findMany({
    where: { status: "ACTIVE" },
  });

  return committees.map((committee) => {
    const current = byCommittee.get(committee.id);
    return {
      committeeId: committee.id,
      name: committee.name,
      slug: committee.slug,
      color: committee.color,
      total: averageRate(current?.rates ?? []),
      activities: current?.activities ?? 0,
    };
  });
}

export async function getCommitteeRanking(seasonId?: string) {
  const season = await resolveSeason(seasonId);
  if (!season) return { season: null, entries: [] };

  const scores = await getCommitteeSeasonScores(season.id);
  const ranked = withCompetitionRanks(scores, (left, right) => left.slug.localeCompare(right.slug));

  return { season, entries: ranked };
}

export async function getMemberCommitteeStandings(memberId: string, seasonId?: string) {
  const memberships = await prisma.memberCommittee.findMany({
    where: { memberId, isActive: true },
    include: { committee: true },
  });
  const ranking = await getCommitteeRanking(seasonId);
  return memberships.map((membership) => {
    const entry = ranking.entries.find((item) => item.committeeId === membership.committeeId);
    return {
      committee: membership.committee,
      rank: entry?.rank ?? null,
      total: entry?.total ?? 0,
    };
  });
}

export type { RankingPeriod };
