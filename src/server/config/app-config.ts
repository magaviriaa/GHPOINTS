import type { CommitteeCreditStrategy } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { writeAuditLog } from "@/server/domain/audit";

const DEFAULT_CREDIT_STRATEGY: CommitteeCreditStrategy = "FULL_CREDIT";

export async function getCreditStrategy(): Promise<CommitteeCreditStrategy> {
  const row = await db.orm.public.AppConfig.where({ key: "committee_credit_strategy" }).first();
  const value = row?.value;
  if (value === "FRACTIONAL_CREDIT" || value === "FULL_CREDIT") {
    return value;
  }
  return DEFAULT_CREDIT_STRATEGY;
}

export async function setConfigValue(input: {
  key: string;
  value: string;
  updatedById: string;
  ip?: string | null;
}) {
  return db.transaction(async (tx) => {
    const before = await tx.orm.public.AppConfig.where({ key: input.key }).first();
    const config = await tx.orm.public.AppConfig.upsert({
      create: { key: input.key, value: input.value, updatedById: input.updatedById },
      update: { value: input.value, updatedById: input.updatedById },
      conflictOn: { key: input.key },
    });
    await writeAuditLog(tx, {
      actorId: input.updatedById,
      action: "APP_CONFIG_UPDATED",
      entityType: "AppConfig",
      entityId: config.id,
      before: before ? { key: before.key, value: before.value } : null,
      after: { key: config.key, value: config.value },
      ip: input.ip,
    });
    return config;
  });
}

export async function listAppConfig() {
  return db.orm.public.AppConfig.orderBy((row) => row.key.asc()).all();
}
