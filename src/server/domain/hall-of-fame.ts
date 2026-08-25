import "server-only";

import { z } from "zod";
import { db, type Tx } from "@/server/db/prisma";
import { toDate } from "@/server/db/time";
import type { JsonValue } from "@/server/db/types";
import { getCommitteeRanking, getIndividualRanking } from "@/server/domain/ranking";
import {
  committeeFromRanking,
  personFromRanking,
  type HallOfFameCommittee,
  type HallOfFamePerson,
  type HallOfFameSnapshot,
  type HallOfFameStats,
} from "@/server/domain/hall-of-fame-pure";

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

export async function buildHallOfFameSnapshot(seasonId: string): Promise<HallOfFameSnapshot> {
  const [active, newer, committees, stats] = await Promise.all([
    getIndividualRanking({ board: "ACTIVE", seasonId, period: "season" }),
    getIndividualRanking({ board: "NEW", seasonId, period: "season" }),
    getCommitteeRanking(seasonId),
    collectSeasonStats(seasonId),
  ]);

  const top3Active = active.entries.slice(0, 3).map(personFromRanking);
  const top3New = newer.entries.slice(0, 3).map(personFromRanking);
  const top3Committees = committees.entries.slice(0, 3).map(committeeFromRanking);

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

async function collectSeasonStats(seasonId: string): Promise<HallOfFameStats> {
  const [activeMembers, newMembers, activities, attendances, points] = await Promise.all([
    db.orm.public.Member.where({ status: "ACTIVE", memberType: "ACTIVE" }).aggregate((agg) => ({
      total: agg.count(),
    })),
    db.orm.public.Member.where({ status: "ACTIVE", memberType: "NEW" }).aggregate((agg) => ({
      total: agg.count(),
    })),
    db.orm.public.Activity.where({ seasonId })
      .where((activity) => activity.status.in(["CLOSED", "PROCESSED", "OPEN"]))
      .aggregate((agg) => ({ total: agg.count() })),
    db.orm.public.Attendance.where({ status: "APPROVED" })
      .where((attendance) =>
        attendance.activity.some((activity) => activity.seasonId.eq(seasonId))
      )
      .aggregate((agg) => ({ total: agg.count() })),
    db.orm.public.PointTransaction.where({ seasonId }).aggregate((agg) => ({
      total: agg.sum("points"),
    })),
  ]);
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
