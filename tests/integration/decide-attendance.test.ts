import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/prisma";
import { isoNow, toIso } from "@/server/db/time";
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
  const fixture: Fixture = {
    memberIds: [],
    attendanceIds: [],
    activityId: "",
    seasonId: "",
    admin: null,
  };

  beforeAll(async () => {
    const season = await db.orm.public.Season.where({ status: "ACTIVE" }).first();
    const admin = await db.orm.public.Member.where((member) =>
      member.roles.some({ role: "ADMIN" })
    ).first();
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
    const activity = await db.orm.public.Activity.create({
      publicId: `test-decide-${stamp}`,
      seasonId: season.id,
      name: `Decide ${stamp}`,
      startsAt: isoNow(new Date(now)),
      registrationStart: toIso(new Date(now - 60_000)),
      registrationEnd: toIso(new Date(now + 3_600_000)),
      individualPoints: POINTS,
      approvalMode: "MANUAL",
      status: "OPEN",
      createdById: admin.id,
    });
    fixture.activityId = activity.id;

    for (let index = 0; index < 4; index += 1) {
      const member = await db.orm.public.Member.create({
        fullName: `Decide Tester ${index} ${stamp}`,
        institutionalEmail: `decide.${index}.${stamp}@test.local`,
        memberType: "ACTIVE",
        status: "ACTIVE",
      });
      fixture.memberIds.push(member.id);
      const attendance = await db.orm.public.Attendance.create({
        activityId: activity.id,
        memberId: member.id,
        status: "PENDING",
        source: "LINK",
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
      await db.orm.public.PointTransaction.where({ activityId: fixture.activityId }).deleteAndCount();
      await db.orm.public.CommitteeActivityScore.where({
        activityId: fixture.activityId,
      }).deleteAndCount();
      await db.orm.public.Attendance.where({ activityId: fixture.activityId }).deleteAndCount();
      await db.orm.public.Activity.where({ id: fixture.activityId }).deleteAndCount();
    }
    if (fixture.memberIds.length) {
      await db.orm.public.AuditLog.where((row) =>
        row.entityId.in(fixture.attendanceIds)
      ).deleteAndCount();
      await db.orm.public.MemberBadge.where((row) =>
        row.memberId.in(fixture.memberIds)
      ).deleteAndCount();
      await db.orm.public.PointTransaction.where((row) =>
        row.memberId.in(fixture.memberIds)
      ).deleteAndCount();
      await db.orm.public.Member.where((row) => row.id.in(fixture.memberIds)).deleteAndCount();
    }
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

    const approved = await db.orm.public.Attendance.where((row) => row.id.in(batch))
      .where({ status: "APPROVED" })
      .aggregate((agg) => ({ total: agg.count() }));
    expect(approved.total).toBe(3);

    const credits = await db.orm.public.PointTransaction.where((row) =>
      row.attendanceId.in(batch)
    )
      .where({ type: "ACTIVITY" })
      .aggregate((agg) => ({
        total: agg.count(),
        points: agg.sum("points"),
      }));
    expect(credits.total).toBe(3);
    expect(credits.points).toBe(3 * POINTS);

    const audits = await db.orm.public.AuditLog.where((row) => row.entityId.in(batch))
      .where({ action: "ATTENDANCE_APPROVED" })
      .aggregate((agg) => ({ total: agg.count() }));
    expect(audits.total).toBe(3);

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

    const row = await db.orm.public.Attendance.first({ id: survivor });
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
