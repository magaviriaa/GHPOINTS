import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
  const prisma = new PrismaClient();
  const created: CreatedFixture = { memberIds: [], activityId: "", seasonId: "" };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (created.activityId && created.seasonId) {
      // Join the post-commit effects before tearing their rows down.
      await runAttendanceEffects({
        activityId: created.activityId,
        seasonId: created.seasonId,
      });
    }
    if (created.activityId) {
      await prisma.pointTransaction.deleteMany({ where: { activityId: created.activityId } });
      await prisma.committeeActivityScore.deleteMany({
        where: { activityId: created.activityId },
      });
      await prisma.attendance.deleteMany({ where: { activityId: created.activityId } });
      await prisma.activity.deleteMany({ where: { id: created.activityId } });
    }
    if (created.memberIds.length) {
      await prisma.memberBadge.deleteMany({ where: { memberId: { in: created.memberIds } } });
      await prisma.pointTransaction.deleteMany({
        where: { memberId: { in: created.memberIds } },
      });
      await prisma.memberCommittee.deleteMany({
        where: { memberId: { in: created.memberIds } },
      });
      await prisma.member.deleteMany({ where: { id: { in: created.memberIds } } });
    }
    await prisma.$disconnect();
  });

  it("credits a member once when the same QR is submitted in parallel", async () => {
    const season = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
    const admin = await prisma.member.findFirst({ where: { roles: { some: { role: "ADMIN" } } } });
    if (!season || !admin) return;

    const member = await prisma.member.create({
      data: {
        fullName: `Concurrencia ${stamp}`,
        institutionalEmail: `concurrencia.${stamp}@test.local`,
        memberType: "ACTIVE",
        status: "ACTIVE",
      },
    });
    created.memberIds.push(member.id);

    const now = Date.now();
    const activity = await prisma.activity.create({
      data: {
        publicId: `test-concurrency-${stamp}`,
        seasonId: season.id,
        name: `Concurrencia ${stamp}`,
        startsAt: new Date(now),
        registrationStart: new Date(now - 60_000),
        registrationEnd: new Date(now + 60 * 60_000),
        individualPoints: 20,
        approvalMode: "AUTO",
        status: "OPEN",
        createdById: admin.id,
      },
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

    const attendances = await prisma.attendance.count({ where: { activityId: activity.id } });
    expect(attendances).toBe(1);

    const total = await prisma.pointTransaction.aggregate({
      where: { memberId: member.id, seasonId: season.id },
      _sum: { points: true },
    });
    expect(total._sum.points).toBe(20);
  });
});
