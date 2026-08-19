import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

type WriteAuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
};

export async function writeAuditLog(input: WriteAuditInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      ip: input.ip ?? null,
    },
  });
}

export async function listAuditLogs(params: {
  query?: string;
  take?: number;
  skip?: number;
}) {
  const take = params.take ?? 50;
  const skip = params.skip ?? 0;
  const query = params.query?.trim();

  return prisma.auditLog.findMany({
    where: query
      ? {
          OR: [
            { action: { contains: query, mode: "insensitive" } },
            { entityType: { contains: query, mode: "insensitive" } },
            { entityId: { contains: query, mode: "insensitive" } },
            { actor: { fullName: { contains: query, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: {
      actor: {
        select: { id: true, fullName: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
}
