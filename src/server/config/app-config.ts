import type { CommitteeCreditStrategy, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const DEFAULT_CREDIT_STRATEGY: CommitteeCreditStrategy = "FULL_CREDIT";

export async function getCreditStrategy(): Promise<CommitteeCreditStrategy> {
  const row = await prisma.appConfig.findUnique({
    where: { key: "committee_credit_strategy" },
  });
  const value = row?.value;
  if (value === "FRACTIONAL_CREDIT" || value === "FULL_CREDIT") {
    return value;
  }
  return DEFAULT_CREDIT_STRATEGY;
}

export async function setConfigValue(
  key: string,
  value: Prisma.InputJsonValue,
  updatedById?: string
) {
  return prisma.appConfig.upsert({
    where: { key },
    update: { value, updatedById },
    create: { key, value, updatedById },
  });
}

export async function listAppConfig() {
  return prisma.appConfig.findMany({ orderBy: { key: "asc" } });
}
