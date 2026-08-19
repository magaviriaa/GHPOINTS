import "server-only";

import { prisma } from "@/server/db/prisma";
import { getActiveSeason } from "@/server/domain/season";
import { getCommitteeRanking } from "@/server/domain/ranking";

export async function getAdminOverview() {
  const season = await getActiveSeason();
  const [
    activeMembers,
    newMembers,
    committees,
    activities,
    pending,
    points,
  ] = await Promise.all([
    prisma.member.count({ where: { status: "ACTIVE", memberType: "ACTIVE" } }),
    prisma.member.count({ where: { status: "ACTIVE", memberType: "NEW" } }),
    prisma.committee.count({ where: { status: "ACTIVE" } }),
    season
      ? prisma.activity.count({
          where: { seasonId: season.id, status: { not: "CANCELLED" } },
        })
      : 0,
    prisma.attendance.count({
      where: {
        status: "PENDING",
        activity: { seasonId: season?.id },
      },
    }),
    season
      ? prisma.pointTransaction.aggregate({
          where: { seasonId: season.id, points: { gt: 0 } },
          _sum: { points: true },
        })
      : { _sum: { points: 0 } },
  ]);

  const seasonAttendances = season
    ? await prisma.attendance.count({
        where: { status: "APPROVED", activity: { seasonId: season.id } },
      })
    : 0;

  const committeeRanking = await getCommitteeRanking(season?.id);
  const leader = committeeRanking.entries[0] ?? null;

  const recentActivities = season
    ? await prisma.activity.findMany({
        where: { seasonId: season.id, status: { in: ["OPEN", "CLOSED", "PROCESSED"] } },
        include: { _count: { select: { attendances: { where: { status: "APPROVED" } } } } },
        orderBy: { startsAt: "asc" },
        take: 12,
      })
    : [];

  const weekly = season
    ? await prisma.$queryRaw<Array<{ week: Date; points: bigint }>>`
        SELECT date_trunc('week', "createdAt") AS week, SUM(points)::bigint AS points
        FROM "PointTransaction"
        WHERE "seasonId" = ${season.id}
        GROUP BY 1
        ORDER BY 1 ASC
      `
    : [];

  return {
    season,
    kpis: {
      activeMembers,
      newMembers,
      committees,
      activities,
      seasonAttendances,
      pointsAwarded: points._sum.points ?? 0,
      pending,
      leadingCommittee: leader,
    },
    attendanceByActivity: recentActivities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      attendances: activity._count.attendances,
      points: activity.individualPoints,
    })),
    pointsByWeek: weekly.map((row) => ({
      week: row.week,
      points: Number(row.points),
    })),
    committeeRanking: committeeRanking.entries.slice(0, 8),
  };
}

export async function getInactiveMembers(days = 21) {
  const season = await getActiveSeason();
  if (!season) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.member.findMany({
    where: {
      status: "ACTIVE",
      attendances: {
        none: { registeredAt: { gte: since } },
      },
    },
    select: {
      id: true,
      fullName: true,
    },
  });
}
