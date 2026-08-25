import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";
import type { MemberType } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { fromDecimal, toIso } from "@/server/db/time";
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

  let collection = db.orm.public.PointTransaction.where({ seasonId: season.id }).where((row) =>
    row.member.some((member) =>
      and(member.status.eq("ACTIVE"), member.memberType.eq(input.board))
    )
  );
  if (window) {
    collection = collection.where((row) => row.createdAt.gte(toIso(window.gte)));
    const until = window.lt;
    if (until !== null) {
      collection = collection.where((row) => row.createdAt.lt(toIso(until)));
    }
  }

  const grouped = await collection.groupBy("memberId").aggregate((agg) => ({ total: agg.sum("points") }));
  const memberIds = grouped.map((row) => row.memberId);
  if (memberIds.length === 0) {
    return { season, period, entries: [] };
  }

  const members = await db.orm.public.Member.where((member) => member.id.in(memberIds))
    .where({ status: "ACTIVE", memberType: input.board })
    .include("committees", (committees) =>
      committees
        .where({ isActive: true })
        .include("committee", (committee) => committee.select("name", "slug", "color"))
    )
    .all();

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
          total: row.total ?? 0,
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
  const fromIso = toIso(window?.gte ?? new Date(0));
  const toIsoBound = window?.lt ? toIso(window.lt) : "9999-12-31T23:59:59.999Z";
  const boardFilter = input.board ?? "";

  const plan = db.raw.sql`
    WITH totals AS (
      SELECT pt."memberId" AS member_id, SUM(pt.points)::int AS total
      FROM "PointTransaction" pt
      JOIN "Member" m ON m.id = pt."memberId"
      WHERE pt."seasonId" = ${season.id}
        AND m.status = 'ACTIVE'
        AND (${boardFilter} = '' OR m."memberType"::text = ${boardFilter})
        AND pt."createdAt" >= ${fromIso}::timestamptz
        AND pt."createdAt" < ${toIsoBound}::timestamptz
      GROUP BY pt."memberId"
    ),
    mine AS (
      SELECT total FROM totals WHERE member_id = ${input.memberId}
    )
    SELECT
      COALESCE((SELECT total FROM mine), 0)::int AS member_total,
      COALESCE((SELECT COUNT(*)::int FROM totals WHERE total > (SELECT total FROM mine)), 0) AS above,
      (SELECT COUNT(*)::int FROM totals) AS board_size,
      (SELECT COUNT(*)::int FROM mine) AS present
  `
    .returnsRow({
      member_total: "pg/int4@1",
      above: "pg/int4@1",
      board_size: "pg/int4@1",
      present: "pg/int4@1",
    })
    .build();
  const rows = await db.runtime().query(plan);

  const row = rows[0];
  const onBoard = (row?.present ?? 0) > 0;
  return {
    season,
    period,
    total: onBoard ? (row?.member_total ?? 0) : 0,
    rank: onBoard ? (row?.above ?? 0) + 1 : null,
    boardSize: row?.board_size ?? 0,
  };
}

export async function getMemberSeasonStanding(memberId: string, seasonId?: string) {
  const member = await db.orm.public.Member.where({ id: memberId }).select("memberType").first();
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
  const scores = await db.orm.public.CommitteeActivityScore.where({ seasonId })
    .where((score) => score.activity.some((activity) => activity.status.in(["CLOSED", "PROCESSED"])))
    .select("committeeId", "participationRate")
    .include("committee", (committee) => committee.select("id", "name", "slug", "color", "status"))
    .all();

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
    const current = byCommittee.get(score.committeeId);
    if (current) {
      current.rates.push(fromDecimal(score.participationRate));
      current.activities += 1;
      continue;
    }
    byCommittee.set(score.committeeId, {
      committeeId: score.committeeId,
      name: String(score.committee.name),
      slug: String(score.committee.slug),
      color: String(score.committee.color),
      status: String(score.committee.status),
      rates: [fromDecimal(score.participationRate)],
      activities: 1,
    });
  }

  const committees = await db.orm.public.Committee.where({ status: "ACTIVE" }).all();

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
  const memberships = await db.orm.public.MemberCommittee.where({ memberId, isActive: true })
    .select("committeeId")
    .include("committee", (committee) => committee.select("id", "name", "slug", "color"))
    .all();
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
