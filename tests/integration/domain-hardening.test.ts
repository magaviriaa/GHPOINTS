import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicId } from "@/lib/public-id";
import { db } from "@/server/db/prisma";
import { toDateOnly, toIso } from "@/server/db/time";
import {
  disableAttendanceToken,
  getOpenActivities,
  publishProposedActivity,
  rejectProposedActivity,
  rotateActivityPublicId,
  rotateAttendanceToken,
  updateActivity,
} from "@/server/domain/activities";
import { adminRegisterAttendance, decideAttendance } from "@/server/domain/attendance";
import {
  bulkAwardActivity,
  listPointTransactions,
  reversePoints,
} from "@/server/domain/admin-points";
import { DomainError, isDomainError } from "@/server/domain/errors";
import { updateSeasonStatus } from "@/server/domain/season";
import { commitMemberImport } from "@/server/domain/import";
import type { Actor } from "@/server/domain/authorization";

const shouldRun = process.env.DATABASE_URL?.startsWith("postgres") ?? false;
const suite = describe.skipIf(!shouldRun);
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

suite("domain hardening invariants", () => {
  let adminId = "";
  let memberId = "";
  let writableSeasonId = "";
  let closedSeasonId = "";
  let writableActivityId = "";
  let uncreditedActivityId = "";
  let closedActivityId = "";
  let closedProposalToPublishId = "";
  let closedProposalToRejectId = "";
  let closedAttendanceId = "";
  let activityTransactionId = "";
  let manualTransactionId = "";
  let closedTransactionId = "";
  const activityIds: string[] = [];

  function admin(): Actor {
    return {
      id: adminId,
      fullName: `Hardening Admin ${stamp}`,
      institutionalEmail: `hardening-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
      status: "ACTIVE",
      roles: [{ role: "ADMIN", committeeId: null }],
      sessionId: "test-session",
    };
  }

  beforeAll(async () => {
    const adminMember = await db.orm.public.Member.create({
      fullName: `Hardening Admin ${stamp}`,
      institutionalEmail: `hardening-admin-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    adminId = adminMember.id;
    const member = await db.orm.public.Member.create({
      fullName: `Hardening Member ${stamp}`,
      institutionalEmail: `hardening-member-${stamp}@example.test`,
      memberType: "ACTIVE",
    });
    memberId = member.id;

    const writableSeason = await db.orm.public.Season.create({
      name: `Writable ${stamp}`,
      startDate: toDateOnly("2026-01-01"),
      endDate: toDateOnly("2026-12-31"),
      status: "UPCOMING",
    });
    writableSeasonId = writableSeason.id;
    const closedSeason = await db.orm.public.Season.create({
      name: `Closed ${stamp}`,
      startDate: toDateOnly("2025-01-01"),
      endDate: toDateOnly("2025-12-31"),
      status: "CLOSED",
    });
    closedSeasonId = closedSeason.id;

    const now = Date.now();
    const createActivity = (seasonId: string, registrationStart: Date, registrationEnd: Date) =>
      db.orm.public.Activity.create({
        publicId: createPublicId(),
        seasonId,
        name: `Hardening activity ${createPublicId()}`,
        startsAt: toIso(new Date(now + 3_600_000)),
        registrationStart: toIso(registrationStart),
        registrationEnd: toIso(registrationEnd),
        individualPoints: 20,
        approvalMode: "MANUAL",
        status: "OPEN",
        createdById: adminId,
      });

    const writable = await createActivity(
      writableSeasonId,
      new Date(now - 60_000),
      new Date(now + 3_600_000)
    );
    writableActivityId = writable.id;
    activityIds.push(writable.id);
    const futureWindow = await createActivity(
      writableSeasonId,
      new Date(now + 3_600_000),
      new Date(now + 7_200_000)
    );
    uncreditedActivityId = futureWindow.id;
    activityIds.push(futureWindow.id);
    const expiredWindow = await createActivity(
      writableSeasonId,
      new Date(now - 7_200_000),
      new Date(now - 3_600_000)
    );
    activityIds.push(expiredWindow.id);
    const closed = await createActivity(
      closedSeasonId,
      new Date(now - 60_000),
      new Date(now + 3_600_000)
    );
    closedActivityId = closed.id;
    activityIds.push(closed.id);

    for (const target of ["publish", "reject"] as const) {
      const proposal = await db.orm.public.Activity.create({
        publicId: createPublicId(),
        seasonId: closedSeasonId,
        name: `Closed proposal ${target} ${stamp}`,
        startsAt: toIso(new Date(now + 3_600_000)),
        registrationStart: toIso(new Date(now - 60_000)),
        registrationEnd: toIso(new Date(now + 3_600_000)),
        individualPoints: 20,
        approvalMode: "MANUAL",
        status: "DRAFT",
        needsApproval: true,
        createdById: adminId,
      });
      activityIds.push(proposal.id);
      if (target === "publish") closedProposalToPublishId = proposal.id;
      else closedProposalToRejectId = proposal.id;
    }

    const approved = await db.orm.public.Attendance.create({
      activityId: writable.id,
      memberId,
      status: "APPROVED",
      approvedAt: toIso(new Date(now)),
      approvedById: adminId,
      source: "ADMIN",
    });
    const closedAttendance = await db.orm.public.Attendance.create({
      activityId: closed.id,
      memberId,
      status: "PENDING",
      source: "ADMIN",
    });
    closedAttendanceId = closedAttendance.id;

    const activityTransaction = await db.orm.public.PointTransaction.create({
      memberId,
      seasonId: writableSeasonId,
      activityId: writable.id,
      attendanceId: approved.id,
      points: 20,
      type: "ACTIVITY",
      reason: "Hardening attendance",
      createdById: adminId,
    });
    activityTransactionId = activityTransaction.id;
    const manualTransaction = await db.orm.public.PointTransaction.create({
      memberId,
      seasonId: writableSeasonId,
      points: 7,
      type: "MANUAL_ADJUSTMENT",
      reason: "Hardening manual",
      createdById: adminId,
    });
    manualTransactionId = manualTransaction.id;
    const closedTransaction = await db.orm.public.PointTransaction.create({
      memberId,
      seasonId: closedSeasonId,
      points: 5,
      type: "MANUAL_ADJUSTMENT",
      reason: "Closed manual",
      createdById: adminId,
    });
    closedTransactionId = closedTransaction.id;
  });

  afterAll(async () => {
    const memberIds = [adminId, memberId].filter(Boolean);
    await db.orm.public.MemberBadge.where((row) => row.memberId.in(memberIds)).deleteAndCount();
    await db.orm.public.AuditLog.where((row) => row.actorId.in(memberIds)).deleteAndCount();
    await db.orm.public.PointTransaction.where({ type: "REVERSAL" })
      .where((row) => row.memberId.in(memberIds))
      .deleteAndCount();
    await db.orm.public.PointTransaction.where((row) => row.memberId.in(memberIds)).deleteAndCount();
    await db.orm.public.CommitteeActivityScore.where((row) => row.activityId.in(activityIds))
      .deleteAndCount();
    await db.orm.public.Attendance.where((row) => row.activityId.in(activityIds)).deleteAndCount();
    await db.orm.public.Activity.where((row) => row.id.in(activityIds)).deleteAndCount();
    await db.orm.public.HallOfFameSeason.where((row) =>
      row.seasonId.in([writableSeasonId, closedSeasonId])
    ).deleteAndCount();
    await db.orm.public.Season.where((row) =>
      row.id.in([writableSeasonId, closedSeasonId])
    ).deleteAndCount();
    await db.orm.public.MemberRole.where((row) => row.memberId.in(memberIds)).deleteAndCount();
    await db.orm.public.Member.where((row) => row.id.in(memberIds)).deleteAndCount();
  });

  it("shows only activities whose registration window is open in the requested season", async () => {
    const open = await getOpenActivities(writableSeasonId);
    expect(open.map((activity) => activity.id)).toEqual([writableActivityId]);
  });

  it("protects an approved attendance credit from direct or implicit ledger drift", async () => {
    await expect(
      updateActivity({
        actor: admin(),
        activityId: writableActivityId,
        individualPoints: 99,
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
    await expect(
      updateActivity({
        actor: admin(),
        activityId: uncreditedActivityId,
        individualPoints: 99,
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
    await expect(
      reversePoints({
        actor: admin(),
        transactionId: activityTransactionId,
        reason: "Wrong path",
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");
  });

  it("reverses a manual transaction once and exposes its reversed state", async () => {
    await reversePoints({
      actor: admin(),
      transactionId: manualTransactionId,
      reason: "Regression test",
    });
    await expect(
      reversePoints({
        actor: admin(),
        transactionId: manualTransactionId,
        reason: "Second reversal",
      })
    ).rejects.toSatisfy((error) => isDomainError(error) && error.code === "CONFLICT");

    const rows = await listPointTransactions({ seasonId: writableSeasonId, take: 100 });
    expect(rows.find((row) => row.id === manualTransactionId)?.isReversed).toBe(true);
  });

  it("blocks every admin write path that would mutate a closed season", async () => {
    const closedError = (error: DomainError) => error.code === "SEASON_CLOSED";

    await expect(
      adminRegisterAttendance({
        actor: admin(),
        activityId: closedActivityId,
        memberId,
      })
    ).rejects.toSatisfy(closedError);
    await expect(
      decideAttendance({
        actor: admin(),
        attendanceIds: [closedAttendanceId],
        to: "APPROVED",
      })
    ).rejects.toSatisfy(closedError);
    await expect(
      bulkAwardActivity({
        actor: admin(),
        activityId: closedActivityId,
        memberIds: [memberId],
      })
    ).rejects.toSatisfy(closedError);
    await expect(
      updateActivity({ actor: admin(), activityId: closedActivityId, name: "Changed" })
    ).rejects.toSatisfy(closedError);
    await expect(
      rotateActivityPublicId({ actor: admin(), activityId: closedActivityId })
    ).rejects.toSatisfy(closedError);
    await expect(
      rotateAttendanceToken({ actor: admin(), activityId: closedActivityId })
    ).rejects.toSatisfy(closedError);
    await expect(
      disableAttendanceToken({ actor: admin(), activityId: closedActivityId })
    ).rejects.toSatisfy(closedError);
    await expect(
      publishProposedActivity({ actor: admin(), activityId: closedProposalToPublishId })
    ).rejects.toSatisfy(closedError);
    await expect(
      rejectProposedActivity({ actor: admin(), activityId: closedProposalToRejectId })
    ).rejects.toSatisfy(closedError);
    await expect(
      reversePoints({
        actor: admin(),
        transactionId: closedTransactionId,
        reason: "Closed",
      })
    ).rejects.toSatisfy(closedError);
    await expect(
      updateSeasonStatus({ actor: admin(), seasonId: closedSeasonId, status: "ACTIVE" })
    ).rejects.toSatisfy(closedError);

    const attendance = await db.orm.public.Attendance.first({ id: closedAttendanceId });
    expect(attendance?.status).toBe("PENDING");
  });

  it("rejects a stale member import when a selected committee became inactive", async () => {
    const committee = await db.orm.public.Committee.create({
      name: `Import committee ${stamp}`,
      slug: `import-committee-${stamp}`,
      color: "#123456",
    });
    const importedEmail = `stale-import-${stamp}@eafit.edu.co`;
    await db.orm.public.Committee.where({ id: committee.id }).update({ status: "INACTIVE" });
    const previewJob = await db.orm.public.ImportJob.create({
      type: "MEMBERS",
      status: "PREVIEWED",
      filename: "stale.csv",
      createdById: adminId,
    });

    await expect(
      commitMemberImport({
        actor: admin(),
        previewId: previewJob.id,
        filename: "stale.csv",
        preview: {
          valid: [
            {
              row: 2,
              fullName: "Stale Import",
              email: importedEmail,
              memberType: "NEW",
              committeeSlugs: [committee.slug],
            },
          ],
          warnings: [],
          errors: [],
        },
      })
    ).rejects.toSatisfy(
      (error) => isDomainError(error) && error.code === "IMPORT_INVALID"
    );

    expect(await db.orm.public.Member.first({ institutionalEmail: importedEmail })).toBeNull();
    await db.orm.public.ImportJob.where({ id: previewJob.id }).deleteAndCount();
    await db.orm.public.Committee.where({ id: committee.id }).deleteAndCount();
  });
});
