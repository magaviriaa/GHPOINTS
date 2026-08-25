import "server-only";

import { z } from "zod";
import { and } from "@prisma/orm-postgres/orm-client";
import { db, type Tx } from "@/server/db/prisma";
import { fromDecimal, toDate } from "@/server/db/time";
import type { JsonValue, MemberType } from "@/server/db/types";
import {
  type HallOfFameCommittee,
  type HallOfFamePerson,
  type HallOfFameSnapshot,
  type HallOfFameStats,
} from "@/server/domain/hall-of-fame-pure";
import { withCompetitionRanks } from "@/server/domain/ranking-pure";
import { averageRate } from "@/server/domain/scoring-pure";

const personSchema = z.object({
  fullName: z.string(),
  total: z.number(),
  rank: z.number(),
});

const committeeSchema = z.object({
  name: z.string(),
  slug: z.string(),
  total: z.number(),
  rank: z.number(),
});

const statsSchema = z.object({
  activeMembers: z.number(),
  newMembers: z.number(),
  activities: z.number(),
  attendances: z.number(),
  pointsAwarded: z.number(),
});

const emptyStats: HallOfFameStats = {
  activeMembers: 0,
  newMembers: 0,
  activities: 0,
  attendances: 0,
  pointsAwarded: 0,
};

function parsePeople(value: JsonValue): HallOfFamePerson[] {
  const parsed = z.array(personSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseCommittees(value: JsonValue): HallOfFameCommittee[] {
  const parsed = z.array(committeeSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseStats(value: JsonValue): HallOfFameStats {
  const parsed = statsSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyStats;
}

async function buildPeopleBoard(tx: Tx, seasonId: string, board: MemberType) {
  const grouped = await tx.orm.public.PointTransaction.where({ seasonId }).where((row) =>
    row.member.some((member) => and(member.status.eq("ACTIVE"), member.memberType.eq(board)))
  ).groupBy("memberId").aggregate((aggregate) => ({ total: aggregate.sum("points") }));
  if (grouped.length === 0) return [];
  const members = await tx.orm.public.Member.where((member) =>
    member.id.in(grouped.map((row) => row.memberId))
  )
    .where({ status: "ACTIVE", memberType: board })
    .select("id", "fullName")
    .all();
  const memberById = new Map(members.map((member) => [member.id, member]));
  return withCompetitionRanks(
    grouped.flatMap((row) => {
      const member = memberById.get(row.memberId);
      return member ? [{ fullName: member.fullName, total: row.total ?? 0 }] : [];
    }),
    (left, right) => left.fullName.localeCompare(right.fullName, "es")
  );
}

async function buildCommitteeBoard(tx: Tx, seasonId: string) {
  const scores = await tx.orm.public.CommitteeActivityScore.where({ seasonId })
    .where((score) => score.activity.some((activity) => activity.status.in(["CLOSED", "PROCESSED"])))
    .select("committeeId", "participationRate")
    .all();
  const rates = new Map<string, number[]>();
  for (const score of scores) {
    const values = rates.get(score.committeeId) ?? [];
    values.push(fromDecimal(score.participationRate));
    rates.set(score.committeeId, values);
  }
  const committees = await tx.orm.public.Committee.where({ status: "ACTIVE" })
    .select("id", "name", "slug")
    .all();
  return withCompetitionRanks(
    committees.map((committee) => ({
      name: committee.name,
      slug: committee.slug,
      total: averageRate(rates.get(committee.id) ?? []),
    })),
    (left, right) => left.slug.localeCompare(right.slug)
  );
}

export async function buildHallOfFameSnapshot(
  tx: Tx,
  seasonId: string
): Promise<HallOfFameSnapshot> {
  const active = await buildPeopleBoard(tx, seasonId, "ACTIVE");
  const newer = await buildPeopleBoard(tx, seasonId, "NEW");
  const committees = await buildCommitteeBoard(tx, seasonId);
  const stats = await collectSeasonStats(tx, seasonId);

  const top3Active = active.slice(0, 3);
  const top3New = newer.slice(0, 3);
  const top3Committees = committees.slice(0, 3);

  return {
    activeWinner: top3Active[0] ?? null,
    newWinner: top3New[0] ?? null,
    committeeWinner: top3Committees[0] ?? null,
    top3Active,
    top3New,
    top3Committees,
    stats,
  };
}

async function collectSeasonStats(tx: Tx, seasonId: string): Promise<HallOfFameStats> {
  const activeMembers = await tx.orm.public.Member.where({
    status: "ACTIVE",
    memberType: "ACTIVE",
  }).aggregate((agg) => ({ total: agg.count() }));
  const newMembers = await tx.orm.public.Member.where({
    status: "ACTIVE",
    memberType: "NEW",
  }).aggregate((agg) => ({ total: agg.count() }));
  const activities = await tx.orm.public.Activity.where({ seasonId })
    .where((activity) => activity.status.in(["CLOSED", "PROCESSED", "OPEN"]))
    .aggregate((agg) => ({ total: agg.count() }));
  const attendances = await tx.orm.public.Attendance.where({ status: "APPROVED" })
    .where((attendance) => attendance.activity.some((activity) => activity.seasonId.eq(seasonId)))
    .aggregate((agg) => ({ total: agg.count() }));
  const points = await tx.orm.public.PointTransaction.where({ seasonId }).aggregate((agg) => ({
    total: agg.sum("points"),
  }));
  return {
    activeMembers: activeMembers.total,
    newMembers: newMembers.total,
    activities: activities.total,
    attendances: attendances.total,
    pointsAwarded: points.total ?? 0,
  };
}

export async function persistHallOfFameSnapshot(
  tx: Tx,
  seasonId: string,
  snapshot: HallOfFameSnapshot
) {
  const data = {
    activeWinnerId: null,
    newWinnerId: null,
    committeeWinnerId: null,
    top3Active: snapshot.top3Active,
    top3New: snapshot.top3New,
    top3Committees: snapshot.top3Committees,
    stats: snapshot.stats,
  };
  return tx.orm.public.HallOfFameSeason.upsert({
    create: { seasonId, ...data },
    update: data,
    conflictOn: { seasonId },
  });
}

export async function listHallOfFameSeasons() {
  const rows = await db.orm.public.HallOfFameSeason.all();
  const seasonIds = rows.map((row) => row.seasonId);
  const seasons =
    seasonIds.length === 0
      ? []
      : await db.orm.public.Season.where((season) => season.id.in(seasonIds)).all();
  const seasonById = new Map(seasons.map((season) => [season.id, season]));

  return rows
    .flatMap((row) => {
      const season = seasonById.get(row.seasonId);
      if (!season) return [];
      // SAFETY: HallOfFame JSON columns are written from persistHallOfFameSnapshot.
      const top3Active = parsePeople(row.top3Active as JsonValue);
      // SAFETY: HallOfFame JSON columns are written from persistHallOfFameSnapshot.
      const top3New = parsePeople(row.top3New as JsonValue);
      // SAFETY: HallOfFame JSON columns are written from persistHallOfFameSnapshot.
      const top3Committees = parseCommittees(row.top3Committees as JsonValue);
      // SAFETY: HallOfFame JSON columns are written from persistHallOfFameSnapshot.
      const stats = parseStats(row.stats as JsonValue);
      return [
        {
          id: row.id,
          seasonId: row.seasonId,
          seasonName: season.name,
          startDate: toDate(season.startDate),
          endDate: toDate(season.endDate),
          snapshot: {
            activeWinner: top3Active[0] ?? null,
            newWinner: top3New[0] ?? null,
            committeeWinner: top3Committees[0] ?? null,
            top3Active,
            top3New,
            top3Committees,
            stats,
          } satisfies HallOfFameSnapshot,
        },
      ];
    })
    .sort((left, right) => right.endDate.getTime() - left.endDate.getTime());
}
