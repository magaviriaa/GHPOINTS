import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertAttendanceTransition } from "@/server/domain/attendance-credit";
import { decideAttendance } from "@/server/domain/attendance";
import { DomainError, ErrorCodes, isDomainError } from "@/server/domain/errors";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("Asistencia credit (db)", () => {
  const prisma = new PrismaClient();
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
    await prisma.$connect();
    const member = await prisma.member.create({
      data: {
        fullName: "Credit Test Admin",
        institutionalEmail: `credit-admin-${stamp}@example.test`,
        memberType: "ACTIVE",
      },
    });
    memberId = member.id;

    const season = await prisma.season.create({
      data: {
        name: `Credit test ${stamp}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        status: "UPCOMING",
      },
    });
    seasonId = season.id;

    const activity = await prisma.activity.create({
      data: {
        publicId: `cred${stamp}`,
        seasonId: season.id,
        name: "Credit activity",
        startsAt: new Date("2026-06-01T18:00:00Z"),
        registrationStart: new Date("2026-05-01T00:00:00Z"),
        registrationEnd: new Date("2026-06-02T00:00:00Z"),
        individualPoints: 20,
        status: "OPEN",
        createdById: member.id,
      },
    });
    activityId = activity.id;

    const attendance = await prisma.attendance.create({
      data: {
        activityId: activity.id,
        memberId: member.id,
        status: "PENDING",
        source: "ADMIN",
      },
    });
    attendanceId = attendance.id;
  });

  afterAll(async () => {
    if (activityId) {
      await prisma.committeeActivityScore.deleteMany({ where: { activityId } });
    }
    if (attendanceId) {
      await prisma.pointTransaction.deleteMany({ where: { attendanceId } });
      await prisma.attendance.deleteMany({ where: { id: attendanceId } });
    }
    if (activityId) {
      await prisma.activity.deleteMany({ where: { id: activityId } });
    }
    if (seasonId) {
      await prisma.season.deleteMany({ where: { id: seasonId } });
    }
    if (memberId) {
      await prisma.memberBadge.deleteMany({ where: { memberId } });
      await prisma.auditLog.deleteMany({ where: { actorId: memberId } });
      await prisma.member.deleteMany({ where: { id: memberId } });
    }
    await prisma.$disconnect();
  });

  it("posts ACTIVITY credit once, reverses on reject, and blocks re-approval", async () => {
    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "APPROVED" });

    const first = await prisma.pointTransaction.findMany({
      where: { attendanceId, type: "ACTIVITY" },
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.points).toBe(20);

    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "APPROVED" });
    const second = await prisma.pointTransaction.findMany({
      where: { attendanceId, type: "ACTIVITY" },
    });
    expect(second).toHaveLength(1);

    await decideAttendance({ actor: actor(), attendanceIds: [attendanceId], to: "REJECTED" });
    const net = await prisma.pointTransaction.aggregate({
      where: { attendanceId },
      _sum: { points: true },
    });
    expect(net._sum.points).toBe(0);

    const attendance = await prisma.attendance.findUnique({ where: { id: attendanceId } });
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
