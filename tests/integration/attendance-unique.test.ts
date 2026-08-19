import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/server/domain/errors";
import { isUniqueConstraint } from "@/server/db/errors";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("attendance uniqueness (db)", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a second attendance row for the same member and activity", async () => {
    const activity = await prisma.activity.findFirst({ where: { status: "OPEN" } });
    const member = await prisma.member.findFirst({
      where: { status: "ACTIVE", roles: { none: { role: "ADMIN" } } },
    });
    if (!activity || !member) return;

    await prisma.attendance.deleteMany({
      where: { activityId: activity.id, memberId: member.id },
    });

    await prisma.attendance.create({
      data: {
        activityId: activity.id,
        memberId: member.id,
        status: "PENDING",
        source: "LINK",
      },
    });

    try {
      await prisma.attendance.create({
        data: {
          activityId: activity.id,
          memberId: member.id,
          status: "PENDING",
          source: "LINK",
        },
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expect(isUniqueConstraint(error)).toBe(true);
      expect(new DomainError("ALREADY_REGISTERED", "Ya registraste tu asistencia.").message).toContain(
        "Ya registraste"
      );
    } finally {
      await prisma.attendance.deleteMany({
        where: { activityId: activity.id, memberId: member.id, status: "PENDING" },
      });
    }
  });
});
