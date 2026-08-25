import "server-only";

import type { PointTransactionType } from "@/server/db/types";
import { db, type Tx } from "@/server/db/prisma";
import { isUniqueConstraint } from "@/server/db/errors";
import { DomainError, ErrorCodes } from "@/server/domain/errors";

export async function findActivityTransaction(tx: Tx, attendanceId: string) {
  return tx.orm.public.PointTransaction.where({ attendanceId, type: "ACTIVITY" }).first();
}

export async function findUnreversedActivityTransaction(tx: Tx, attendanceId: string) {
  const row = await tx.orm.public.PointTransaction.where({
    attendanceId,
    type: "ACTIVITY",
  }).first();
  if (!row) return null;
  const reversal = await tx.orm.public.PointTransaction.where({ reversalOfId: row.id }).first();
  return reversal ? null : row;
}

function reversedActivityCreditConflict() {
  return new DomainError(
    ErrorCodes.CONFLICT,
    "Esta asistencia ya tuvo un crédito revertido. Usa un ajuste manual.",
    409
  );
}

export async function createActivityPoints(
  tx: Tx,
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
    return await tx.orm.public.PointTransaction.create({
      memberId: input.memberId,
      seasonId: input.seasonId,
      activityId: input.activityId,
      attendanceId: input.attendanceId,
      points: input.points,
      type: "ACTIVITY",
      reason: input.reason,
      createdById: input.createdById ?? null,
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
  tx: Tx,
  input: {
    originalId: string;
    createdById?: string | null;
    reason: string;
  }
) {
  const original = await tx.orm.public.PointTransaction.first({ id: input.originalId });
  if (!original) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa transacción.", 404);
  }

  const existingReversal = await tx.orm.public.PointTransaction.where({
    reversalOfId: original.id,
  }).first();
  if (existingReversal) return existingReversal;

  if (original.type === "REVERSAL") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "No se puede revertir una reversión.",
      400
    );
  }

  try {
    return await tx.orm.public.PointTransaction.create({
      memberId: original.memberId,
      seasonId: original.seasonId,
      activityId: original.activityId,
      attendanceId: original.attendanceId,
      points: -original.points,
      type: "REVERSAL",
      reason: input.reason,
      createdById: input.createdById ?? null,
      reversalOfId: original.id,
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const raced = await tx.orm.public.PointTransaction.where({
        reversalOfId: original.id,
      }).first();
      if (raced) return raced;
    }
    throw error;
  }
}

export async function createManualPoints(
  tx: Tx,
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

  return tx.orm.public.PointTransaction.create({
    memberId: input.memberId,
    seasonId: input.seasonId,
    activityId: input.activityId ?? null,
    points: input.points,
    type: input.type,
    reason,
    createdById: input.createdById,
  });
}

export async function sumMemberPoints(memberId: string, seasonId: string) {
  const result = await db.orm.public.PointTransaction.where({ memberId, seasonId }).aggregate(
    (aggregate) => ({ total: aggregate.sum("points") })
  );
  return result.total ?? 0;
}

export async function listMemberPointHistory(
  memberId: string,
  filters?: { seasonId?: string; take?: number }
) {
  let collection = db.orm.public.PointTransaction.where({ memberId })
    .select("id", "points", "type", "reason", "createdAt")
    .include("activity", (activity) => activity.select("id", "name"))
    .orderBy((row) => row.createdAt.desc());

  if (filters?.seasonId) {
    collection = collection.where({ seasonId: filters.seasonId });
  }
  if (filters?.take !== undefined) {
    collection = collection.limit(filters.take);
  }

  return collection.all();
}
