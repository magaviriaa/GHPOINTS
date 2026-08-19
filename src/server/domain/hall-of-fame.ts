import "server-only";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getCommitteeRanking, getIndividualRanking } from "@/server/domain/ranking";
import {
  committeeFromRanking,
  personFromRanking,
  type HallOfFameCommittee,
  type HallOfFamePerson,
  type HallOfFameSnapshot,
  type HallOfFameStats,
} from "@/server/domain/hall-of-fame-pure";

type TransactionClient = Prisma.TransactionClient;

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

function parsePeople(value: Prisma.JsonValue): HallOfFamePerson[] {
  const parsed = z.array(personSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseCommittees(value: Prisma.JsonValue): HallOfFameCommittee[] {
  const parsed = z.array(committeeSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseStats(value: Prisma.JsonValue): HallOfFameStats {
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
    prisma.member.count({ where: { status: "ACTIVE", memberType: "ACTIVE" } }),
    prisma.member.count({ where: { status: "ACTIVE", memberType: "NEW" } }),
    prisma.activity.count({
      where: { seasonId, status: { in: ["CLOSED", "PROCESSED", "OPEN"] } },
    }),
    prisma.attendance.count({
      where: { status: "APPROVED", activity: { seasonId } },
    }),
    prisma.pointTransaction.aggregate({
      where: { seasonId },
      _sum: { points: true },
    }),
  ]);
  return {
    activeMembers,
    newMembers,
    activities,
    attendances,
    pointsAwarded: points._sum.points ?? 0,
  };
}

export async function persistHallOfFameSnapshot(
  tx: TransactionClient,
  seasonId: string,
  snapshot: HallOfFameSnapshot
) {
  const existing = await tx.hallOfFameSeason.findUnique({ where: { seasonId } });
  const data = {
    activeWinnerId: null,
    newWinnerId: null,
    committeeWinnerId: null,
    top3Active: snapshot.top3Active,
    top3New: snapshot.top3New,
    top3Committees: snapshot.top3Committees,
    stats: snapshot.stats,
  };
  if (existing) {
    return tx.hallOfFameSeason.update({
      where: { seasonId },
      data,
    });
  }
  return tx.hallOfFameSeason.create({
    data: { seasonId, ...data },
  });
}

export async function listHallOfFameSeasons() {
  const rows = await prisma.hallOfFameSeason.findMany({
    include: { season: true },
    orderBy: { season: { endDate: "desc" } },
  });
  return rows.map((row) => ({
    id: row.id,
    seasonId: row.seasonId,
    seasonName: row.season.name,
    startDate: row.season.startDate,
    endDate: row.season.endDate,
    snapshot: {
      activeWinner: parsePeople(row.top3Active)[0] ?? null,
      newWinner: parsePeople(row.top3New)[0] ?? null,
      committeeWinner: parseCommittees(row.top3Committees)[0] ?? null,
      top3Active: parsePeople(row.top3Active),
      top3New: parsePeople(row.top3New),
      top3Committees: parseCommittees(row.top3Committees),
      stats: parseStats(row.stats),
    } satisfies HallOfFameSnapshot,
  }));
}
