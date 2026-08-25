import "server-only";

import type { PointTransactionType } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { toDate } from "@/server/db/time";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { createManualPoints, reverseTransaction } from "@/server/domain/points";
import { upsertApprovedAttendance } from "@/server/domain/attendance";
import { recomputeActivityScores } from "@/server/domain/scoring";
import { assertSeasonWritable, resolveSeason } from "@/server/domain/season";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { refreshBadges } from "@/server/domain/badges";
import { lockActivityRow, lockSeasonRow } from "@/server/domain/locks";

export function assertManualPointsValue(points: number): void {
  if (!Number.isSafeInteger(points) || points === 0) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Los puntos deben ser un número entero distinto de cero.",
      400
    );
  }
}

export async function assignManualPoints(input: {
  actor: Actor;
  memberId: string;
  seasonId?: string;
  points: number;
  reason: string;
  type?: Extract<PointTransactionType, "MANUAL_ADJUSTMENT" | "BONUS" | "PENALTY">;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const season = await resolveSeason(input.seasonId);
  if (!season) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No hay una temporada activa.", 404);
  }
  assertSeasonWritable(season.status);
  assertManualPointsValue(input.points);

  const member = await db.orm.public.Member.first({ id: input.memberId });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const inferredType =
    input.type ?? (input.points < 0 ? "PENALTY" : "MANUAL_ADJUSTMENT");

  const transaction = await db.transaction(async (tx) => {
    const lockedSeason = await lockSeasonRow(tx, season.id);
    assertSeasonWritable(lockedSeason.status);
    const created = await createManualPoints(tx, {
      memberId: member.id,
      seasonId: season.id,
      points: input.points,
      type: inferredType,
      reason: input.reason,
      createdById: input.actor.id,
    });
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "POINTS_ASSIGNED",
      entityType: "PointTransaction",
      entityId: created.id,
      after: { memberId: member.id, points: input.points, reason: input.reason },
      ip: input.ip,
    });
    return created;
  });
  await refreshBadges({ seasonId: season.id, memberId: member.id });
  return transaction;
}

export async function reversePoints(input: {
  actor: Actor;
  transactionId: string;
  reason: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(ErrorCodes.REASON_REQUIRED, "Indica el motivo de la reversión.", 400);
  }

  const original = await db.orm.public.PointTransaction.where({ id: input.transactionId })
    .include("season", (season) => season.select("status"))
    .first();
  if (!original) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa transacción.", 404);
  }
  assertSeasonWritable(original.season.status);
  if (original.type === "ACTIVITY") {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "Corrige los puntos de asistencia rechazando o anulando la asistencia correspondiente.",
      409
    );
  }
  if (original.type === "REVERSAL") {
    throw new DomainError(ErrorCodes.VALIDATION, "No se puede revertir una reversión.", 400);
  }
  const existingReversal = await db.orm.public.PointTransaction.where({
    reversalOfId: original.id,
  }).first();
  if (existingReversal) {
    throw new DomainError(ErrorCodes.CONFLICT, "Esta transacción ya fue revertida.", 409);
  }

  const reversal = await db.transaction(async (tx) => {
    const lockedSeason = await lockSeasonRow(tx, original.seasonId);
    assertSeasonWritable(lockedSeason.status);
    const created = await reverseTransaction(tx, {
      originalId: input.transactionId,
      createdById: input.actor.id,
      reason,
    });
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "POINTS_REVERSED",
      entityType: "PointTransaction",
      entityId: created.id,
      after: { reversalOf: input.transactionId, points: created.points },
      ip: input.ip,
    });
    return created;
  });
  await refreshBadges({ seasonId: original.seasonId, memberId: original.memberId });
  return reversal;
}

export async function bulkAwardActivity(input: {
  actor: Actor;
  activityId: string;
  memberIds: string[];
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const uniqueIds = Array.from(new Set(input.memberIds));
  if (uniqueIds.length === 0) {
    throw new DomainError(ErrorCodes.VALIDATION, "Selecciona al menos un integrante.", 400);
  }
  const activity = await db.orm.public.Activity.where({ id: input.activityId })
    .include("season", (season) => season.select("status"))
    .first();
  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  assertSeasonWritable(activity.season.status);

  const now = new Date();
  await db.transaction(async (tx) => {
    const lockedSeason = await lockSeasonRow(tx, activity.seasonId);
    assertSeasonWritable(lockedSeason.status);
    const lockedActivity = await lockActivityRow(tx, activity.id);
    if (lockedActivity.status !== "OPEN" && lockedActivity.status !== "CLOSED") {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Solo se pueden asignar asistencias mientras la actividad está abierta o cerrada.",
        409
      );
    }
    for (const memberId of uniqueIds) {
      const attendance = await upsertApprovedAttendance(tx, {
        activity: lockedActivity,
        memberId,
        actorId: input.actor.id,
        now,
        source: "ADMIN",
      });
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action: "ATTENDANCE_BULK_APPROVED",
        entityType: "Attendance",
        entityId: attendance.id,
        after: { memberId, activityId: lockedActivity.id, status: "APPROVED" },
        ip: input.ip,
      });
    }
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "POINTS_BULK_ASSIGNED",
      entityType: "Activity",
      entityId: lockedActivity.id,
      after: { memberIds: uniqueIds, points: lockedActivity.individualPoints },
      ip: input.ip,
    });
  });
  await recomputeActivityScores(activity.id);
}

export async function listPointTransactions(filters: {
  seasonId?: string;
  memberId?: string;
  take?: number;
}) {
  const seasonId = (await resolveSeason(filters.seasonId))?.id;
  let collection = db.orm.public.PointTransaction.include("member", (member) =>
    member.select("fullName", "institutionalEmail")
  )
    .include("activity", (activity) => activity.select("name"))
    .include("createdBy", (createdBy) => createdBy.select("fullName"));

  if (seasonId) {
    collection = collection.where({ seasonId });
  }
  if (filters.memberId) {
    collection = collection.where({ memberId: filters.memberId });
  }

  const rows = await collection
    .orderBy((row) => row.createdAt.desc())
    .limit(filters.take ?? 100)
    .all();
  const reversibleIds = rows
    .filter((row) => row.type !== "REVERSAL")
    .map((row) => row.id);
  const reversals =
    reversibleIds.length === 0
      ? []
      : await db.orm.public.PointTransaction.where((row) =>
          row.reversalOfId.in(reversibleIds)
        )
          .select("reversalOfId")
          .all();
  const reversedIds = new Set(
    reversals.flatMap((row) => (row.reversalOfId ? [row.reversalOfId] : []))
  );
  return rows.map((row) => ({
    ...row,
    createdAt: toDate(row.createdAt),
    isReversed: reversedIds.has(row.id),
  }));
}
