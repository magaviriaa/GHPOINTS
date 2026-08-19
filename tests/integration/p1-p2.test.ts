import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decideAttendance } from "@/server/domain/attendance";
import { updateSeasonStatus } from "@/server/domain/season";
import { setMemberRoles } from "@/server/domain/members";
import type { Actor } from "@/server/domain/authorization";
import { createPublicId } from "@/lib/public-id";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("P1/P2 domain (db)", () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  let adminId = "";
  let memberId = "";
  let seasonId = "";
  let activityId = "";
  let attendanceId = "";
  let closedSeasonId = "";

  function adminActor(): Actor {
    return {
      id: adminId,
      fullName: "Roles Admin",
      institutionalEmail: `roles-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
      status: "ACTIVE",
      roles: [{ role: "ADMIN", committeeId: null }],
      sessionId: "test-session",
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.member.create({
      data: {
        fullName: "Roles Admin",
        institutionalEmail: `roles-admin-${stamp}@example.test`,
        memberType: "ACTIVE",
        roles: { create: [{ role: "ADMIN" }, { role: "MEMBER" }] },
      },
    });
    adminId = admin.id;

    const member = await prisma.member.create({
      data: {
        fullName: "Roles Member",
        institutionalEmail: `roles-member-${stamp}@example.test`,
        memberType: "NEW",
        roles: { create: { role: "MEMBER" } },
      },
    });
    memberId = member.id;

    const season = await prisma.season.create({
      data: {
        name: `Roles ${stamp}`,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        status: "UPCOMING",
      },
    });
    seasonId = season.id;

    const closed = await prisma.season.create({
      data: {
        name: `HOF ${stamp}`,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-06-01"),
        status: "UPCOMING",
      },
    });
    closedSeasonId = closed.id;

    const activity = await prisma.activity.create({
      data: {
        publicId: createPublicId(),
        seasonId: season.id,
        name: "Bulk reject activity",
        startsAt: new Date("2026-06-01T18:00:00Z"),
        registrationStart: new Date("2026-05-01T00:00:00Z"),
        registrationEnd: new Date("2026-06-02T00:00:00Z"),
        individualPoints: 10,
        status: "OPEN",
        createdById: admin.id,
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
    await prisma.memberBadge.deleteMany({
      where: { memberId: { in: [adminId, memberId].filter(Boolean) } },
    });
    if (closedSeasonId) {
      await prisma.hallOfFameSeason.deleteMany({ where: { seasonId: closedSeasonId } });
    }
    if (activityId) {
      await prisma.committeeActivityScore.deleteMany({ where: { activityId } });
      await prisma.pointTransaction.deleteMany({ where: { activityId } });
      await prisma.attendance.deleteMany({ where: { activityId } });
      await prisma.activityPublicIdHistory.deleteMany({ where: { activityId } });
      await prisma.activity.deleteMany({ where: { id: activityId } });
    }
    if (seasonId) await prisma.season.deleteMany({ where: { id: seasonId } });
    if (closedSeasonId) await prisma.season.deleteMany({ where: { id: closedSeasonId } });
    if (adminId || memberId) {
      await prisma.memberRole.deleteMany({
        where: { memberId: { in: [adminId, memberId].filter(Boolean) } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: [adminId, memberId].filter(Boolean) } },
      });
      await prisma.member.deleteMany({
        where: { id: { in: [adminId, memberId].filter(Boolean) } },
      });
    }
    await prisma.$disconnect();
  });

  it("bulk-rejects pending attendances without crediting points", async () => {
    await decideAttendance({
      actor: adminActor(),
      attendanceIds: [attendanceId],
      to: "REJECTED",
    });
    const row = await prisma.attendance.findUnique({ where: { id: attendanceId } });
    expect(row?.status).toBe("REJECTED");
    const points = await prisma.pointTransaction.count({ where: { attendanceId } });
    expect(points).toBe(0);
  });

  it("lets admin assign COMMITTEE_LEADER and keeps MEMBER", async () => {
    const committee = await prisma.committee.findFirst();
    if (!committee) return;
    await setMemberRoles({
      actor: adminActor(),
      memberId,
      isAdmin: false,
      leaderCommitteeIds: [committee.id],
    });
    const roles = await prisma.memberRole.findMany({ where: { memberId } });
    expect(roles.some((role) => role.role === "MEMBER")).toBe(true);
    expect(
      roles.some((role) => role.role === "COMMITTEE_LEADER" && role.committeeId === committee.id)
    ).toBe(true);
  });

  it("persists Hall of Fame when a season closes", async () => {
    await updateSeasonStatus({
      actor: adminActor(),
      seasonId: closedSeasonId,
      status: "CLOSED",
    });
    const hof = await prisma.hallOfFameSeason.findUnique({
      where: { seasonId: closedSeasonId },
    });
    expect(hof).not.toBeNull();
    expect(hof?.stats).toBeTruthy();
  });

  it("can grant and revoke ADMIN when another GH General exists", async () => {
    await setMemberRoles({
      actor: adminActor(),
      memberId,
      isAdmin: true,
      leaderCommitteeIds: [],
    });
    expect(await prisma.memberRole.count({ where: { memberId, role: "ADMIN" } })).toBeGreaterThan(0);
    await setMemberRoles({
      actor: adminActor(),
      memberId,
      isAdmin: false,
      leaderCommitteeIds: [],
    });
    expect(await prisma.memberRole.count({ where: { memberId, role: "ADMIN" } })).toBe(0);
  });
});
