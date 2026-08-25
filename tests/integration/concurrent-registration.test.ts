import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { isoNow, toIso } from "@/server/db/time";
import { registerAttendance } from "@/server/domain/attendance";
import { runAttendanceEffects } from "@/server/domain/attendance-effects";
import { isDomainError } from "@/server/domain/errors";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));
const stamp = Date.now();

type CreatedFixture = {
  memberIds: string[];
  activityId: string;
  seasonId: string;
};

describe.skipIf(!shouldRun)("concurrent QR registration (db)", () => {
  const created: CreatedFixture = { memberIds: [], activityId: "", seasonId: "" };

  afterAll(async () => {
    if (created.activityId && created.seasonId) {
      // Join the post-commit effects before tearing their rows down.
      await runAttendanceEffects({
        activityId: created.activityId,
        seasonId: created.seasonId,
      });
    }
    if (created.activityId) {
      await db.orm.public.PointTransaction.where({ activityId: created.activityId }).deleteAndCount();
      await db.orm.public.CommitteeActivityScore.where({
        activityId: created.activityId,
      }).deleteAndCount();
      await db.orm.public.Attendance.where({ activityId: created.activityId }).deleteAndCount();
      await db.orm.public.Activity.where({ id: created.activityId }).deleteAndCount();
    }
    if (created.memberIds.length) {
      await db.orm.public.MemberBadge.where((row) =>
        row.memberId.in(created.memberIds)
      ).deleteAndCount();
      await db.orm.public.PointTransaction.where((row) =>
        row.memberId.in(created.memberIds)
      ).deleteAndCount();
      await db.orm.public.MemberCommittee.where((row) =>
        row.memberId.in(created.memberIds)
      ).deleteAndCount();
      await db.orm.public.Member.where((row) => row.id.in(created.memberIds)).deleteAndCount();
    }
  });

  it("credits a member once when the same QR is submitted in parallel", async () => {
    const season = await db.orm.public.Season.where({ status: "ACTIVE" }).first();
    const admin = await db.orm.public.Member.where((member) =>
      member.roles.some({ role: "ADMIN" })
    ).first();
    if (!season || !admin) return;

    const member = await db.orm.public.Member.create({
      fullName: `Concurrencia ${stamp}`,
      institutionalEmail: `concurrencia.${stamp}@test.local`,
      memberType: "ACTIVE",
      status: "ACTIVE",
    });
    created.memberIds.push(member.id);

    const now = Date.now();
    const activity = await db.orm.public.Activity.create({
      publicId: `test-concurrency-${stamp}`,
      seasonId: season.id,
      name: `Concurrencia ${stamp}`,
      startsAt: isoNow(new Date(now)),
      registrationStart: toIso(new Date(now - 60_000)),
      registrationEnd: toIso(new Date(now + 60 * 60_000)),
      individualPoints: 20,
      approvalMode: "AUTO",
      status: "OPEN",
      createdById: admin.id,
    });
    created.activityId = activity.id;
    created.seasonId = season.id;

    const actor: Actor = {
      id: member.id,
      fullName: member.fullName,
      institutionalEmail: member.institutionalEmail,
      memberType: member.memberType,
      status: member.status,
      roles: [{ role: "MEMBER", committeeId: null }],
      sessionId: "test-session",
    };

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        registerAttendance({ actor, publicId: activity.publicId, source: "QR" })
      )
    );

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejections = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    );
    expect(fulfilled.length).toBe(1);
    expect(rejections.length).toBe(7);

    for (const reason of rejections) {
      expect(isDomainError(reason)).toBe(true);
      expect(isDomainError(reason) && reason.code).toBe("ALREADY_REGISTERED");
    }

    const attendances = await db.orm.public.Attendance.where({ activityId: activity.id }).aggregate(
      (agg) => ({ total: agg.count() })
    );
    expect(attendances.total).toBe(1);

    const total = await db.orm.public.PointTransaction.where({
      memberId: member.id,
      seasonId: season.id,
    }).aggregate((agg) => ({ points: agg.sum("points") }));
    expect(total.points).toBe(20);
  });
});
