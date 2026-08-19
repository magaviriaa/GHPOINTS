import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decideAttendance } from "@/server/domain/attendance";
import { runAttendanceEffects } from "@/server/domain/attendance-effects";
import { isDomainError } from "@/server/domain/errors";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));
const stamp = Date.now();
const POINTS = 15;

type Fixture = {
  memberIds: string[];
  attendanceIds: string[];
  activityId: string;
  seasonId: string;
  admin: Actor | null;
};

describe.skipIf(!shouldRun)("decideAttendance (db)", () => {
  const prisma = new PrismaClient();
  const fixture: Fixture = {
    memberIds: [],
    attendanceIds: [],
    activityId: "",
    seasonId: "",
    admin: null,
  };

  beforeAll(async () => {
    await prisma.$connect();
    const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
    const admin = await prisma.member.findFirst({
      where: { roles: { some: { role: "ADMIN" } } },
    });
    if (!season || !admin) return;

    fixture.seasonId = season.id;
    fixture.admin = {
      id: admin.id,
      fullName: admin.fullName,
      institutionalEmail: admin.institutionalEmail,
      memberType: admin.memberType,
      status: admin.status,
      roles: [{ role: "ADMIN", committeeId: null }],
      sessionId: "test-session",
    };

    const now = Date.now();
    const activity = await prisma.activity.create({
      data: {
        publicId: `test-decide-${stamp}`,
        seasonId: season.id,
        name: `Decide ${stamp}`,
        startsAt: new Date(now),
        registrationStart: new Date(now - 60_000),
        registrationEnd: new Date(now + 3_600_000),
        individualPoints: POINTS,
        approvalMode: "MANUAL",
        status: "OPEN",
        createdById: admin.id,
      },
    });
    fixture.activityId = activity.id;

    for (let index = 0; index < 4; index += 1) {
      const member = await prisma.member.create({
        data: {
          fullName: `Decide Tester ${index} ${stamp}`,
          institutionalEmail: `decide.${index}.${stamp}@test.local`,
          memberType: "ACTIVE",
          status: "ACTIVE",
        },
      });
      fixture.memberIds.push(member.id);
      const attendance = await prisma.attendance.create({
        data: {
          activityId: activity.id,
          memberId: member.id,
          status: "PENDING",
          source: "LINK",
        },
      });
      fixture.attendanceIds.push(attendance.id);
    }
  });

  afterAll(async () => {
    if (fixture.activityId && fixture.seasonId) {
      await runAttendanceEffects({
        activityId: fixture.activityId,
        seasonId: fixture.seasonId,
      });
      await prisma.pointTransaction.deleteMany({ where: { activityId: fixture.activityId } });
      await prisma.committeeActivityScore.deleteMany({
        where: { activityId: fixture.activityId },
      });
      await prisma.attendance.deleteMany({ where: { activityId: fixture.activityId } });
      await prisma.activity.deleteMany({ where: { id: fixture.activityId } });
    }
    if (fixture.memberIds.length) {
      await prisma.auditLog.deleteMany({ where: { entityId: { in: fixture.attendanceIds } } });
      await prisma.memberBadge.deleteMany({ where: { memberId: { in: fixture.memberIds } } });
      await prisma.pointTransaction.deleteMany({
        where: { memberId: { in: fixture.memberIds } },
      });
      await prisma.member.deleteMany({ where: { id: { in: fixture.memberIds } } });
    }
    await prisma.$disconnect();
  });

  it("approves a batch atomically, audits each row and notifies every Integrante", async () => {
    if (!fixture.admin) return;
    const batch = fixture.attendanceIds.slice(0, 3);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const results = await decideAttendance({
      actor: fixture.admin,
      attendanceIds: batch,
      to: "APPROVED",
    });
    // dispatchAppEvent is fire-and-forget; let the microtask queue drain.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ConsoleEmailSender logs `console.info("[email:console]", { to, subject, text })`.
    const approvalEmails = info.mock.calls.filter((call) =>
      String(Object(call[1]).subject ?? "").startsWith("Asistencia aprobada")
    ).length;
    info.mockRestore();

    expect(results.length).toBe(3);

    const approved = await prisma.attendance.count({
      where: { id: { in: batch }, status: "APPROVED" },
    });
    expect(approved).toBe(3);

    const credits = await prisma.pointTransaction.aggregate({
      where: { attendanceId: { in: batch }, type: "ACTIVITY" },
      _sum: { points: true },
      _count: { _all: true },
    });
    expect(credits._count._all).toBe(3);
    expect(credits._sum.points).toBe(3 * POINTS);

    const audits = await prisma.auditLog.count({
      where: { entityId: { in: batch }, action: "ATTENDANCE_APPROVED" },
    });
    expect(audits).toBe(3);

    expect(approvalEmails).toBe(3);
  });

  it("applies nothing when one id in the batch does not exist", async () => {
    if (!fixture.admin) return;
    const survivor = fixture.attendanceIds[3]!;

    await expect(
      decideAttendance({
        actor: fixture.admin,
        attendanceIds: [survivor, "definitely-not-an-id"],
        to: "REJECTED",
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "NOT_FOUND");

    const row = await prisma.attendance.findUnique({ where: { id: survivor } });
    expect(row?.status).toBe("PENDING");
  });

  it("requires a reason to cancel", async () => {
    if (!fixture.admin) return;
    await expect(
      decideAttendance({
        actor: fixture.admin,
        attendanceIds: [fixture.attendanceIds[3]!],
        to: "CANCELLED",
        reason: "   ",
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "REASON_REQUIRED");
  });
});
