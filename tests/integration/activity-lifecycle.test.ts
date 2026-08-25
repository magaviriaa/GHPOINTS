import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/prisma";
import { toDateOnly, toIso } from "@/server/db/time";
import {
  cancelActivity,
  transitionActivity,
  updateActivity,
} from "@/server/domain/activities";
import { registerAttendance } from "@/server/domain/attendance";
import { isDomainError } from "@/server/domain/errors";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));
const suite = describe.skipIf(!shouldRun);
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

suite("strict activity lifecycle (db)", () => {
  let adminId = "";
  let memberId = "";
  let raceMemberId = "";
  let seasonId = "";
  let activityId = "";
  let pendingActivityId = "";
  let raceActivityId = "";

  function actor(id = adminId): Actor {
    return {
      id,
      fullName: id === adminId ? "Lifecycle Admin" : "Lifecycle Member",
      institutionalEmail: `${id}@example.test`,
      memberType: "ACTIVE",
      status: "ACTIVE",
      roles: [{ role: id === adminId ? "ADMIN" : "MEMBER", committeeId: null }],
      sessionId: `session-${id}`,
    };
  }

  beforeAll(async () => {
    const admin = await db.orm.public.Member.create({
      fullName: `Lifecycle Admin ${stamp}`,
      institutionalEmail: `lifecycle-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    adminId = admin.id;
    const member = await db.orm.public.Member.create({
      fullName: `Lifecycle Member ${stamp}`,
      institutionalEmail: `lifecycle-member-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    memberId = member.id;
    const raceMember = await db.orm.public.Member.create({
      fullName: `Lifecycle Race ${stamp}`,
      institutionalEmail: `lifecycle-race-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    raceMemberId = raceMember.id;
    const season = await db.orm.public.Season.create({
      name: `Lifecycle ${stamp}`,
      startDate: toDateOnly("2026-01-01"),
      endDate: toDateOnly("2026-12-31"),
      status: "UPCOMING",
    });
    seasonId = season.id;
    const now = Date.now();
    const base = {
      seasonId,
      startsAt: toIso(new Date(now + 60_000)),
      registrationStart: toIso(new Date(now - 60_000)),
      registrationEnd: toIso(new Date(now + 3_600_000)),
      individualPoints: 18,
      approvalMode: "AUTO" as const,
      createdById: adminId,
    };
    const activity = await db.orm.public.Activity.create({
      ...base,
      publicId: `lifecycle-${stamp}`,
      name: `Lifecycle cancel ${stamp}`,
      status: "OPEN",
    });
    activityId = activity.id;
    const attendance = await db.orm.public.Attendance.create({
      activityId,
      memberId,
      status: "APPROVED",
      approvedAt: toIso(new Date()),
      approvedById: adminId,
      source: "ADMIN",
    });
    await db.orm.public.PointTransaction.create({
      memberId,
      seasonId,
      activityId,
      attendanceId: attendance.id,
      points: 18,
      type: "ACTIVITY",
      reason: "Lifecycle credit",
      createdById: adminId,
    });
    const pendingActivity = await db.orm.public.Activity.create({
      ...base,
      publicId: `lifecycle-pending-${stamp}`,
      name: `Lifecycle pending ${stamp}`,
      status: "CLOSED",
      approvalMode: "MANUAL",
    });
    pendingActivityId = pendingActivity.id;
    await db.orm.public.Attendance.create({
      activityId: pendingActivityId,
      memberId,
      status: "PENDING",
      source: "LINK",
    });
    const raceActivity = await db.orm.public.Activity.create({
      ...base,
      publicId: `lifecycle-race-${stamp}`,
      name: `Lifecycle race ${stamp}`,
      status: "OPEN",
    });
    raceActivityId = raceActivity.id;
  });

  afterAll(async () => {
    const activityIds = [activityId, pendingActivityId, raceActivityId].filter(Boolean);
    const memberIds = [adminId, memberId, raceMemberId].filter(Boolean);
    await db.orm.public.MemberBadge.where((row) => row.memberId.in(memberIds)).deleteAndCount();
    await db.orm.public.AuditLog.where((row) =>
      row.actorId.in(memberIds)
    ).deleteAndCount();
    await db.orm.public.PointTransaction.where((row) =>
      row.activityId.in(activityIds)
    ).deleteAndCount();
    await db.orm.public.CommitteeActivityScore.where((row) =>
      row.activityId.in(activityIds)
    ).deleteAndCount();
    await db.orm.public.Attendance.where((row) => row.activityId.in(activityIds)).deleteAndCount();
    await db.orm.public.Activity.where((row) => row.id.in(activityIds)).deleteAndCount();
    await db.orm.public.Season.where({ id: seasonId }).deleteAndCount();
    await db.orm.public.Member.where((row) => row.id.in(memberIds)).deleteAndCount();
  });

  it("cancels atomically, reverses credits and is idempotent", async () => {
    await cancelActivity({
      actor: actor(),
      activityId,
      reason: "El evento no se realizará.",
    });
    await cancelActivity({ actor: actor(), activityId, reason: "Retry" });

    const activity = await db.orm.public.Activity.first({ id: activityId });
    expect(activity?.status).toBe("CANCELLED");
    expect(activity?.cancelReason).toBe("El evento no se realizará.");
    const attendance = await db.orm.public.Attendance.where({ activityId, memberId }).first();
    expect(attendance?.status).toBe("CANCELLED");
    const ledger = await db.orm.public.PointTransaction.where({ activityId }).aggregate((aggregate) => ({
      count: aggregate.count(),
      total: aggregate.sum("points"),
    }));
    expect(ledger).toEqual({ count: 2, total: 0 });
    const audit = await db.orm.public.AuditLog.where({
      entityId: activityId,
      action: "ACTIVITY_CANCELLED",
    }).aggregate((aggregate) => ({ total: aggregate.count() }));
    expect(audit.total).toBe(1);
  });

  it("blocks processing while pending attendances remain", async () => {
    await expect(
      transitionActivity({ actor: actor(), activityId: pendingActivityId, to: "PROCESSED" })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
    expect((await db.orm.public.Activity.first({ id: pendingActivityId }))?.status).toBe("CLOSED");
  });

  it("freezes points and approval mode after publication", async () => {
    await expect(
      updateActivity({ actor: actor(), activityId: raceActivityId, individualPoints: 99 })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
    await expect(
      updateActivity({ actor: actor(), activityId: raceActivityId, approvalMode: "MANUAL" })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
  });

  it("serializes registration with cancellation and leaves no orphan credit", async () => {
    await Promise.allSettled([
      registerAttendance({ actor: actor(raceMemberId), activityId: raceActivityId, source: "LINK" }),
      cancelActivity({ actor: actor(), activityId: raceActivityId, reason: "Race test" }),
    ]);
    expect((await db.orm.public.Activity.first({ id: raceActivityId }))?.status).toBe("CANCELLED");
    const attendance = await db.orm.public.Attendance.where({
      activityId: raceActivityId,
      memberId: raceMemberId,
    }).first();
    expect(attendance?.status).not.toBe("APPROVED");
    expect(attendance?.status).not.toBe("PENDING");
    const total = await db.orm.public.PointTransaction.where({
      activityId: raceActivityId,
      memberId: raceMemberId,
    }).aggregate((aggregate) => ({ total: aggregate.sum("points") }));
    expect(total.total ?? 0).toBe(0);
  });
});
