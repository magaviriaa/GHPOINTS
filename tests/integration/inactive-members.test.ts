import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getInactiveMembers } from "@/server/domain/analytics";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("getInactiveMembers (db)", () => {
  const prisma = new PrismaClient();
  const stamp = Date.now();
  let memberId = "";
  let createdSeasonId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const active = await prisma.season.findFirst({ where: { status: "ACTIVE" } });
    if (!active) {
      const season = await prisma.season.create({
        data: {
          name: `Inactive ${stamp}`,
          startDate: new Date("2026-01-01"),
          endDate: new Date("2026-12-31"),
          status: "ACTIVE",
        },
      });
      createdSeasonId = season.id;
    }
    const member = await prisma.member.create({
      data: {
        fullName: `Quiet Member ${stamp}`,
        institutionalEmail: `quiet-${stamp}@example.test`,
        memberType: "ACTIVE",
        status: "ACTIVE",
      },
    });
    memberId = member.id;
  });

  afterAll(async () => {
    if (memberId) {
      await prisma.attendance.deleteMany({ where: { memberId } });
      await prisma.member.deleteMany({ where: { id: memberId } });
    }
    if (createdSeasonId) {
      await prisma.season.deleteMany({ where: { id: createdSeasonId } });
    }
    await prisma.$disconnect();
  });

  it("returns ACTIVE members with no recent attendance via the database filter", async () => {
    const inactive = await getInactiveMembers(21);
    expect(inactive.some((member) => member.id === memberId)).toBe(true);
  });
});
