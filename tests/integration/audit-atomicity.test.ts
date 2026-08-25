import "dotenv/config";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/prisma";
import { writeAuditLog } from "@/server/domain/audit";

const shouldRun = Boolean(process.env.DATABASE_URL?.startsWith("postgres"));

describe.skipIf(!shouldRun)("audit atomicity (db)", () => {
  it("rolls back the domain write when the audit payload is rejected", async () => {
    const slug = `audit-rollback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await expect(
      db.transaction(async (tx) => {
        const committee = await tx.orm.public.Committee.create({
          name: "Audit rollback",
          slug,
          color: "#123456",
        });
        await writeAuditLog(tx, {
          action: "TEST_INVALID_AUDIT",
          entityType: "Committee",
          entityId: committee.id,
          // AuditLog JSON intentionally accepts only object/array values.
          after: "invalid primitive",
        });
      })
    ).rejects.toBeTruthy();
    expect(await db.orm.public.Committee.where({ slug }).first()).toBeNull();
  });
});
