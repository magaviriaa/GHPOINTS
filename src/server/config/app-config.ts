import type { CommitteeCreditStrategy } from "@/server/db/types";
import { db } from "@/server/db/prisma";

const DEFAULT_CREDIT_STRATEGY: CommitteeCreditStrategy = "FULL_CREDIT";

export async function getCreditStrategy(): Promise<CommitteeCreditStrategy> {
  const row = await db.orm.public.AppConfig.where({ key: "committee_credit_strategy" }).first();
  const value = row?.value;
  if (value === "FRACTIONAL_CREDIT" || value === "FULL_CREDIT") {
    return value;
  }
  return DEFAULT_CREDIT_STRATEGY;
}

export async function setConfigValue(key: string, value: string, updatedById?: string) {
  return db.orm.public.AppConfig.upsert({
    create: { key, value, updatedById: updatedById ?? null },
    update: { value, updatedById: updatedById ?? null },
    conflictOn: { key },
  });
}

export async function listAppConfig() {
  return db.orm.public.AppConfig.orderBy((row) => row.key.asc()).all();
}
