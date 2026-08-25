import "dotenv/config";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/prisma";
import { DomainError } from "@/server/domain/errors";
import { isUniqueConstraint } from "@/server/db/errors";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("attendance uniqueness (db)", () => {

  it("rejects a second attendance row for the same member and activity", async () => {
    const activity = await db.orm.public.Activity.where({ status: "OPEN" }).first();
    const member = await db.orm.public.Member.where({ status: "ACTIVE" })
      .where((row) => row.roles.none({ role: "ADMIN" }))
      .first();
    if (!activity || !member) return;

    await db.orm.public.Attendance.where({
      activityId: activity.id,
      memberId: member.id,
    }).deleteAndCount();

    await db.orm.public.Attendance.create({
      activityId: activity.id,
      memberId: member.id,
      status: "PENDING",
      source: "LINK",
    });

    try {
      await db.orm.public.Attendance.create({
        activityId: activity.id,
        memberId: member.id,
        status: "PENDING",
        source: "LINK",
      });
      throw new Error("expected unique violation");
    } catch (error) {
      expect(isUniqueConstraint(error)).toBe(true);
      expect(new DomainError("ALREADY_REGISTERED", "Ya registraste tu asistencia.").message).toContain(
        "Ya registraste"
      );
    } finally {
      await db.orm.public.Attendance.where({
        activityId: activity.id,
        memberId: member.id,
        status: "PENDING",
      }).deleteAndCount();
    }
  });
});
