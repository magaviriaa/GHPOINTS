import "server-only";

import { db } from "@/server/db/prisma";
import { toDate, toIso } from "@/server/db/time";
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
    pointsAwarded,
  ] = await Promise.all([
    db.orm.public.Member.where({ status: "ACTIVE", memberType: "ACTIVE" }).aggregate((agg) => ({
      total: agg.count(),
    })),
    db.orm.public.Member.where({ status: "ACTIVE", memberType: "NEW" }).aggregate((agg) => ({
      total: agg.count(),
    })),
    db.orm.public.Committee.where({ status: "ACTIVE" }).aggregate((agg) => ({ total: agg.count() })),
    season
      ? db.orm.public.Activity.where({ seasonId: season.id })
          .where((activity) => activity.status.neq("CANCELLED"))
          .aggregate((agg) => ({ total: agg.count() }))
      : Promise.resolve({ total: 0 }),
    season
      ? db.orm.public.Attendance.where({ status: "PENDING" })
          .where((attendance) =>
            attendance.activity.some((activity) => activity.seasonId.eq(season.id))
          )
          .aggregate((agg) => ({ total: agg.count() }))
      : db.orm.public.Attendance.where({ status: "PENDING" }).aggregate((agg) => ({
          total: agg.count(),
        })),
    season
      ? db.orm.public.PointTransaction.where({ seasonId: season.id })
          .where((row) => row.points.gt(0))
          .aggregate((agg) => ({ total: agg.sum("points") }))
      : Promise.resolve({ total: 0 }),
  ]);

  const seasonAttendances = season
    ? (
        await db.orm.public.Attendance.where({ status: "APPROVED" })
          .where((attendance) =>
            attendance.activity.some((activity) => activity.seasonId.eq(season.id))
          )
          .aggregate((agg) => ({ total: agg.count() }))
      ).total
    : 0;

  const committeeRanking = await getCommitteeRanking(season?.id);
  const leader = committeeRanking.entries[0] ?? null;

  const recentActivities = season
    ? await db.orm.public.Activity.where({ seasonId: season.id })
        .where((activity) => activity.status.in(["OPEN", "CLOSED", "PROCESSED"]))
        .include("attendances", (attendances) => attendances.where({ status: "APPROVED" }).count())
        .orderBy((activity) => activity.startsAt.asc())
        .limit(12)
        .all()
    : [];

  const weekly = season
    ? await db.runtime().query(
        db.raw.sql`
          SELECT date_trunc('week', "createdAt") AS week, SUM(points)::bigint AS points
          FROM "PointTransaction"
          WHERE "seasonId" = ${season.id}
          GROUP BY 1
          ORDER BY 1 ASC
        `
          .returnsRow({
            week: "pg/timestamptz-string@1",
            points: "pg/int8@1",
          })
          .build()
      )
    : [];

  return {
    season,
    kpis: {
      activeMembers: activeMembers.total,
      newMembers: newMembers.total,
      committees: committees.total,
      activities: activities.total,
      seasonAttendances,
      pointsAwarded: pointsAwarded.total ?? 0,
      pending: pending.total,
      leadingCommittee: leader,
    },
    attendanceByActivity: recentActivities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      attendances: activity.attendances,
      points: activity.individualPoints,
    })),
    pointsByWeek: weekly.map((row) => ({
      week: toDate(row.week),
      points: Number(row.points),
    })),
    committeeRanking: committeeRanking.entries.slice(0, 8),
  };
}

export async function getInactiveMembers(days = 21) {
  const season = await getActiveSeason();
  if (!season) return [];
  const since = toIso(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  return await db.orm.public.Member.where({ status: "ACTIVE" })
    .where((member) => member.attendances.none((attendance) => attendance.registeredAt.gte(since)))
    .select("id", "fullName")
    .all();
}
