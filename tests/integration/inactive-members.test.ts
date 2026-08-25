import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { toDateOnly } from "@/server/db/time";
import { getInactiveMembers } from "@/server/domain/analytics";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("getInactiveMembers (db)", () => {
  const stamp = Date.now();
  let memberId = "";
  let createdSeasonId = "";

  beforeAll(async () => {
    const active = await db.orm.public.Season.where({ status: "ACTIVE" }).first();
    if (!active) {
      const season = await db.orm.public.Season.create({
        name: `Inactive ${stamp}`,
        startDate: toDateOnly("2026-01-01"),
        endDate: toDateOnly("2026-12-31"),
        status: "ACTIVE",
      });
      createdSeasonId = season.id;
    }
    const member = await db.orm.public.Member.create({
      fullName: `Quiet Member ${stamp}`,
      institutionalEmail: `quiet-${stamp}@example.test`,
      memberType: "ACTIVE",
      status: "ACTIVE",
    });
    memberId = member.id;
  });

  afterAll(async () => {
    if (memberId) {
      await db.orm.public.Attendance.where({ memberId }).deleteAndCount();
      await db.orm.public.Member.where({ id: memberId }).deleteAndCount();
    }
    if (createdSeasonId) {
      await db.orm.public.Season.where({ id: createdSeasonId }).deleteAndCount();
    }
  });

  it("returns ACTIVE members with no recent attendance via the database filter", async () => {
    const inactive = await getInactiveMembers(21);
    expect(inactive.some((member: { id: string }) => member.id === memberId)).toBe(true);
  });
});
