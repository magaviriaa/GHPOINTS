import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { toDateOnly, toIso } from "@/server/db/time";
import { decideAttendance } from "@/server/domain/attendance";
import { updateSeasonStatus } from "@/server/domain/season";
import { setMemberRoles } from "@/server/domain/members";
import type { Actor } from "@/server/domain/authorization";
import { createPublicId } from "@/lib/public-id";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("P1/P2 domain (db)", () => {
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
    const admin = await db.orm.public.Member.create({
      fullName: "Roles Admin",
      institutionalEmail: `roles-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
      roles: (roles) => roles.create([{ role: "ADMIN" }, { role: "MEMBER" }]),
    });
    adminId = admin.id;

    const member = await db.orm.public.Member.create({
      fullName: "Roles Member",
      institutionalEmail: `roles-member-${stamp}@example.test`,
      memberType: "NEW",
      roles: (roles) => roles.create({ role: "MEMBER" }),
    });
    memberId = member.id;

    const season = await db.orm.public.Season.create({
      name: `Roles ${stamp}`,
      startDate: toDateOnly("2026-01-01"),
      endDate: toDateOnly("2026-12-31"),
      status: "UPCOMING",
    });
    seasonId = season.id;

    const closed = await db.orm.public.Season.create({
      name: `HOF ${stamp}`,
      startDate: toDateOnly("2025-01-01"),
      endDate: toDateOnly("2025-06-01"),
      status: "UPCOMING",
    });
    closedSeasonId = closed.id;

    const activity = await db.orm.public.Activity.create({
      publicId: createPublicId(),
      seasonId: season.id,
      name: "Bulk reject activity",
      startsAt: toIso(new Date("2026-06-01T18:00:00Z")),
      registrationStart: toIso(new Date("2026-05-01T00:00:00Z")),
      registrationEnd: toIso(new Date("2026-06-02T00:00:00Z")),
      individualPoints: 10,
      status: "OPEN",
      createdById: admin.id,
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
    const memberIds = [adminId, memberId].filter(Boolean);
    if (memberIds.length) {
      await db.orm.public.MemberBadge.where((row) => row.memberId.in(memberIds)).deleteAndCount();
    }
    if (closedSeasonId) {
      await db.orm.public.HallOfFameSeason.where({ seasonId: closedSeasonId }).deleteAndCount();
    }
    if (activityId) {
      await db.orm.public.CommitteeActivityScore.where({ activityId }).deleteAndCount();
      await db.orm.public.PointTransaction.where({ activityId }).deleteAndCount();
      await db.orm.public.Attendance.where({ activityId }).deleteAndCount();
      await db.orm.public.ActivityPublicIdHistory.where({ activityId }).deleteAndCount();
      await db.orm.public.Activity.where({ id: activityId }).deleteAndCount();
    }
    if (seasonId) await db.orm.public.Season.where({ id: seasonId }).deleteAndCount();
    if (closedSeasonId) await db.orm.public.Season.where({ id: closedSeasonId }).deleteAndCount();
    if (adminId || memberId) {
      await db.orm.public.MemberRole.where((row) => row.memberId.in(memberIds)).deleteAndCount();
      await db.orm.public.AuditLog.where((row) => row.actorId.in(memberIds)).deleteAndCount();
      await db.orm.public.Member.where((row) => row.id.in(memberIds)).deleteAndCount();
    }
  });

  it("bulk-rejects pending attendances without crediting points", async () => {
    await decideAttendance({
      actor: adminActor(),
      attendanceIds: [attendanceId],
      to: "REJECTED",
    });
    const row = await db.orm.public.Attendance.first({ id: attendanceId });
    expect(row?.status).toBe("REJECTED");
    const points = await db.orm.public.PointTransaction.where({ attendanceId }).aggregate((agg) => ({
      total: agg.count(),
    }));
    expect(points.total).toBe(0);
  });

  it("lets admin assign COMMITTEE_LEADER and keeps MEMBER", async () => {
    const committee = await db.orm.public.Committee.first();
    if (!committee) return;
    await setMemberRoles({
      actor: adminActor(),
      memberId,
      isAdmin: false,
      leaderCommitteeIds: [committee.id],
    });
    const roles = await db.orm.public.MemberRole.where({ memberId }).all();
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
    const hof = await db.orm.public.HallOfFameSeason.where({ seasonId: closedSeasonId }).first();
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
    const granted = await db.orm.public.MemberRole.where({ memberId, role: "ADMIN" }).aggregate(
      (agg) => ({ total: agg.count() })
    );
    expect(granted.total).toBeGreaterThan(0);
    await setMemberRoles({
      actor: adminActor(),
      memberId,
      isAdmin: false,
      leaderCommitteeIds: [],
    });
    const revoked = await db.orm.public.MemberRole.where({ memberId, role: "ADMIN" }).aggregate(
      (agg) => ({ total: agg.count() })
    );
    expect(revoked.total).toBe(0);
  });
});
