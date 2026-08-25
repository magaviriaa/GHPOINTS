import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { toDateOnly, toIso } from "@/server/db/time";
import { assertAttendanceTransition } from "@/server/domain/attendance-credit";
import { decideAttendance } from "@/server/domain/attendance";
import { DomainError, ErrorCodes, isDomainError } from "@/server/domain/errors";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("Asistencia credit (db)", () => {
  const stamp = Date.now();
  let memberId = "";
  let activityId = "";
  let attendanceId = "";
  let seasonId = "";

  function actor(): Actor {
    return {
      id: memberId,
      fullName: "Credit Test Admin",
      institutionalEmail: `credit-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
      status: "ACTIVE",
      roles: [{ role: "ADMIN", committeeId: null }],
      sessionId: "test-session",
    };
  }

  beforeAll(async () => {
    const member = await db.orm.public.Member.create({
      fullName: "Credit Test Admin",
      institutionalEmail: `credit-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    memberId = member.id;

    const season = await db.orm.public.Season.create({
      name: `Credit test ${stamp}`,
      startDate: toDateOnly("2026-01-01"),
      endDate: toDateOnly("2026-12-31"),
      status: "UPCOMING",
    });
    seasonId = season.id;

    const activity = await db.orm.public.Activity.create({
      publicId: `cred${stamp}`,
      seasonId: season.id,
      name: "Credit activity",
      startsAt: toIso(new Date("2026-06-01T18:00:00Z")),
      registrationStart: toIso(new Date("2026-05-01T00:00:00Z")),
      registrationEnd: toIso(new Date("2026-06-02T00:00:00Z")),
      individualPoints: 20,
      status: "OPEN",
      createdById: member.id,
    });
    activityId = activity.id;

    const attendance = await db.orm.public.Attendance.create({
      activityId: activity.id,
      memberId: member.id,
      status: "PENDING",
      source: "ADMIN",
    });
    attendanceId = attendance.id;
  });

  afterAll(async () => {
    if (activityId) {
      await db.orm.public.CommitteeActivityScore.where({ activityId }).deleteAndCount();
    }
    if (attendanceId) {
      await db.orm.public.PointTransaction.where({ attendanceId }).deleteAndCount();
      await db.orm.public.Attendance.where({ id: attendanceId }).deleteAndCount();
    }
    if (activityId) {
      await db.orm.public.Activity.where({ id: activityId }).deleteAndCount();
    }
    if (seasonId) {
      await db.orm.public.Season.where({ id: seasonId }).deleteAndCount();
    }
    if (memberId) {
      await db.orm.public.MemberBadge.where({ memberId }).deleteAndCount();
      await db.orm.public.AuditLog.where({ actorId: memberId }).deleteAndCount();
      await db.orm.public.Member.where({ id: memberId }).deleteAndCount();
    }
  });

  it("posts ACTIVITY credit once, reverses on reject, and blocks re-approval", async () => {
    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "APPROVED" });

    const first = await db.orm.public.PointTransaction.where({
      attendanceId,
      type: "ACTIVITY",
    }).all();
    expect(first).toHaveLength(1);
    expect(first[0]?.points).toBe(20);

    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "APPROVED" });
    const second = await db.orm.public.PointTransaction.where({
      attendanceId,
      type: "ACTIVITY",
    }).all();
    expect(second).toHaveLength(1);

    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "REJECTED" });
    const net = await db.orm.public.PointTransaction.where({ attendanceId }).aggregate((agg) => ({
      points: agg.sum("points"),
    }));
    expect(net.points).toBe(0);

    const attendance = await db.orm.public.Attendance.first({ id: attendanceId });
    expect(attendance?.status).toBe("REJECTED");
    expect(() => assertAttendanceTransition("REJECTED", "APPROVED")).toThrow(DomainError);

    try {
      await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "APPROVED" });
      throw new Error("expected re-approval to fail");
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (isDomainError(error)) {
        expect(error.code).toBe(ErrorCodes.CONFLICT);
      }
    }
  });
});
