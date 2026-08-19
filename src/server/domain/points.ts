import "server-only";

import type { PointTransactionType, Prisma as PrismaNS } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { isUniqueConstraint } from "@/server/db/errors";
import { DomainError, ErrorCodes } from "@/server/domain/errors";

type TransactionClient = PrismaNS.TransactionClient;

export async function findActivityTransaction(
  tx: TransactionClient,
  attendanceId: string
) {
  return tx.pointTransaction.findFirst({
    where: { attendanceId, type: "ACTIVITY" },
  });
}

export async function findUnreversedActivityTransaction(
  tx: TransactionClient,
  attendanceId: string
) {
  return tx.pointTransaction.findFirst({
    where: {
      attendanceId,
      type: "ACTIVITY",
      reversedBy: { is: null },
    },
  });
}

function reversedActivityCreditConflict() {
  return new DomainError(
    ErrorCodes.CONFLICT,
    "Esta asistencia ya tuvo un crédito revertido. Usa un ajuste manual.",
    409
  );
}

export async function createActivityPoints(
  tx: TransactionClient,
  input: {
    memberId: string;
    seasonId: string;
    activityId: string;
    attendanceId: string;
    points: number;
    reason: string;
    createdById?: string | null;
  }
) {
  const unreversed = await findUnreversedActivityTransaction(tx, input.attendanceId);
  if (unreversed) return unreversed;

  const existing = await findActivityTransaction(tx, input.attendanceId);
  if (existing) {
    throw reversedActivityCreditConflict();
  }

  try {
    return await tx.pointTransaction.create({
      data: {
        memberId: input.memberId,
        seasonId: input.seasonId,
        activityId: input.activityId,
        attendanceId: input.attendanceId,
        points: input.points,
        type: "ACTIVITY",
        reason: input.reason,
        createdById: input.createdById ?? null,
      },
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const raced = await findUnreversedActivityTransaction(tx, input.attendanceId);
      if (raced) return raced;
      throw reversedActivityCreditConflict();
    }
    throw error;
  }
}

export async function reverseTransaction(
  tx: TransactionClient,
  input: {
    originalId: string;
    createdById?: string | null;
    reason: string;
  }
) {
  const original = await tx.pointTransaction.findUnique({
    where: { id: input.originalId },
  });
  if (!original) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa transacción.", 404);
  }

  const existingReversal = await tx.pointTransaction.findUnique({
    where: { reversalOfId: original.id },
  });
  if (existingReversal) return existingReversal;

  if (original.type === "REVERSAL") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "No se puede revertir una reversión.",
      400
    );
  }

  try {
    return await tx.pointTransaction.create({
      data: {
        memberId: original.memberId,
        seasonId: original.seasonId,
        activityId: original.activityId,
        attendanceId: original.attendanceId,
        points: -original.points,
        type: "REVERSAL",
        reason: input.reason,
        createdById: input.createdById ?? null,
        reversalOfId: original.id,
      },
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const raced = await tx.pointTransaction.findUnique({
        where: { reversalOfId: original.id },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function createManualPoints(
  tx: TransactionClient,
  input: {
    memberId: string;
    seasonId: string;
    points: number;
    type: Extract<PointTransactionType, "MANUAL_ADJUSTMENT" | "BONUS" | "PENALTY">;
    reason: string;
    createdById: string;
    activityId?: string | null;
  }
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(
      ErrorCodes.REASON_REQUIRED,
      "Las asignaciones manuales requieren un motivo.",
      400
    );
  }

  return tx.pointTransaction.create({
    data: {
      memberId: input.memberId,
      seasonId: input.seasonId,
      activityId: input.activityId ?? null,
      points: input.points,
      type: input.type,
      reason,
      createdById: input.createdById,
    },
  });
}

export async function sumMemberPoints(memberId: string, seasonId: string) {
  const result = await prisma.pointTransaction.aggregate({
    where: { memberId, seasonId },
    _sum: { points: true },
  });
  return result._sum.points ?? 0;
}

export async function listMemberPointHistory(
  memberId: string,
  filters?: { seasonId?: string; take?: number }
) {
  return prisma.pointTransaction.findMany({
    where: {
      memberId,
      seasonId: filters?.seasonId,
    },
    include: { activity: true },
    orderBy: { createdAt: "desc" },
    take: filters?.take,
  });
}
