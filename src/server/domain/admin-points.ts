import "server-only";

import type { PointTransactionType } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { toDate } from "@/server/db/time";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { createManualPoints, reverseTransaction } from "@/server/domain/points";
import { upsertApprovedAttendance } from "@/server/domain/attendance";
import { recomputeActivityScores } from "@/server/domain/scoring";
import { resolveSeason } from "@/server/domain/season";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { refreshBadges } from "@/server/domain/badges";

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
  if (season.status === "CLOSED") {
    throw new DomainError(ErrorCodes.SEASON_CLOSED, "Esta temporada ya está cerrada.", 400);
  }

  const member = await db.orm.public.Member.first({ id: input.memberId });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const inferredType =
    input.type ?? (input.points < 0 ? "PENALTY" : "MANUAL_ADJUSTMENT");

  const tx = await db.transaction((dbTx) =>
    createManualPoints(dbTx, {
      memberId: member.id,
      seasonId: season.id,
      points: input.points,
      type: inferredType,
      reason: input.reason,
      createdById: input.actor.id,
    })
  );

  await writeAuditLog({
    actorId: input.actor.id,
    action: "POINTS_ASSIGNED",
    entityType: "PointTransaction",
    entityId: tx.id,
    after: { memberId: member.id, points: input.points, reason: input.reason },
    ip: input.ip,
  });
  await refreshBadges({ seasonId: season.id, memberId: member.id });
  return tx;
}

export async function reversePoints(input: {
  actor: Actor;
  transactionId: string;
  reason: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const reversal = await db.transaction((dbTx) =>
    reverseTransaction(dbTx, {
      originalId: input.transactionId,
      createdById: input.actor.id,
      reason: input.reason,
    })
  );

  await writeAuditLog({
    actorId: input.actor.id,
    action: "POINTS_REVERSED",
    entityType: "PointTransaction",
    entityId: reversal.id,
    after: { reversalOf: input.transactionId, points: reversal.points },
    ip: input.ip,
  });
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
  const activity = await db.orm.public.Activity.first({ id: input.activityId });
  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const memberId of uniqueIds) {
      await upsertApprovedAttendance(tx, {
        activity,
        memberId,
        actorId: input.actor.id,
        now,
        source: "ADMIN",
      });
    }
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "POINTS_BULK_ASSIGNED",
    entityType: "Activity",
    entityId: activity.id,
    after: { memberIds: uniqueIds, points: activity.individualPoints },
    ip: input.ip,
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
  return rows.map((row) => ({
    ...row,
    createdAt: toDate(row.createdAt),
  }));
}
