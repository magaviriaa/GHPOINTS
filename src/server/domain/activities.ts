import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";
import { z } from "zod";
import type { ActivityStatus, ActivityType, ApprovalMode } from "@/server/db/types";
import { db, type Tx } from "@/server/db/prisma";
import { isoNow, toDate, toIso } from "@/server/db/time";
import { createPublicId } from "@/lib/public-id";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { getActiveSeason, resolveSeason, assertSeasonWritable } from "@/server/domain/season";
import { recomputeActivityScores } from "@/server/domain/scoring";
import { runAttendanceEffects } from "@/server/domain/attendance-effects";
import { syncAttendanceCredit } from "@/server/domain/attendance-credit";
import { lockActivityRow, lockSeasonRow } from "@/server/domain/locks";
import type { Actor } from "@/server/domain/authorization";
import { isAdmin, requireAdmin, requireCommitteeLeader } from "@/server/domain/authorization";
import {
  generateAttendanceToken,
  hashAttendanceToken,
  safeEqual,
} from "@/server/auth/secrets";

const MAX_INDIVIDUAL_POINTS = 10_000;

const ACTIVITY_TRANSITIONS = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: ["PROCESSED", "CANCELLED"],
  PROCESSED: ["CANCELLED"],
  CANCELLED: [],
} as const satisfies Record<ActivityStatus, readonly ActivityStatus[]>;

export function assertActivityTransition(from: ActivityStatus, to: ActivityStatus) {
  if (ACTIVITY_TRANSITIONS[from].some((status) => status === to)) return;
  throw new DomainError(
    ErrorCodes.CONFLICT,
    `No se puede cambiar una actividad de ${from} a ${to}.`,
    409
  );
}

function assertActivityMutable(status: ActivityStatus) {
  if (status === "PROCESSED" || status === "CANCELLED") {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "Las actividades procesadas o canceladas son de solo lectura.",
      409
    );
  }
}

async function lockWritableSeason(tx: Tx, seasonId: string) {
  const season = await lockSeasonRow(tx, seasonId);
  assertSeasonWritable(season.status);
  return season;
}

const activityFieldsSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre de la actividad es obligatorio."),
    individualPoints: z
      .number({ error: "Los GH Points deben ser un número." })
      .int("Los GH Points deben ser un número entero.")
      .min(0, "Los GH Points no pueden ser negativos.")
      .max(MAX_INDIVIDUAL_POINTS, `Los GH Points no pueden superar ${MAX_INDIVIDUAL_POINTS}.`),
    startsAt: z.date({ error: "La fecha de la actividad no es válida." }),
    registrationStart: z.date({
      error: "La apertura del registro no es una fecha válida.",
    }),
    registrationEnd: z.date({
      error: "El cierre del registro no es una fecha válida.",
    }),
  })
  .refine((fields) => fields.registrationStart <= fields.registrationEnd, {
    message: "El registro no puede cerrar antes de abrir.",
    path: ["registrationEnd"],
  });

type ActivityFields = z.infer<typeof activityFieldsSchema>;

export function parseActivityFields(fields: {
  name: string;
  individualPoints: number;
  startsAt: Date;
  registrationStart: Date;
  registrationEnd: Date;
}): ActivityFields {
  const parsed = activityFieldsSchema.safeParse(fields);
  if (parsed.success) return parsed.data;
  throw new DomainError(
    ErrorCodes.VALIDATION,
    parsed.error.issues[0]?.message ?? "Revisa los datos de la actividad.",
    400
  );
}

function withAttendanceCount<T extends { attendances: number }>(row: T) {
  return { ...row, _count: { attendances: row.attendances } };
}

async function getWritableActivity(id: string) {
  const activity = await db.orm.public.Activity.where({ id })
    .include("season", (season) => season.select("status"))
    .first();
  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  assertSeasonWritable(activity.season.status);
  return activity;
}

function requireUnchangedActivity<T>(row: T | null): T {
  if (!row) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "La actividad cambió mientras la estabas actualizando. Recarga e inténtalo de nuevo.",
      409
    );
  }
  return row;
}

export async function listActivities(filters?: {
  seasonId?: string;
  status?: ActivityStatus;
}) {
  const seasonId = filters?.seasonId ?? (await getActiveSeason())?.id;
  if (!seasonId) return [];

  let collection = db.orm.public.Activity.where({ seasonId });
  if (filters?.status) {
    collection = collection.where({ status: filters.status });
  }

  const rows = await collection
    .include("attendances", (attendances) => attendances.count())
    .include("season")
    .orderBy((activity) => activity.startsAt.desc())
    .all();

  return rows.map(withAttendanceCount);
}

export async function getActivityByPublicId(publicId: string) {
  return db.orm.public.Activity.where({ publicId }).include("season").first();
}

export async function getActivityById(id: string) {
  const activity = await db.orm.public.Activity.where({ id })
    .include("season")
    .include("committee", (committee) => committee.select("id", "name", "slug"))
    .include("createdBy", (member) => member.select("fullName"))
    .include("publicIdHistory", (history) =>
      history.orderBy((row) => row.retiredAt.desc()).limit(12)
    )
    .include("attendances", (attendances) => attendances.count())
    .first();
  if (!activity) return null;
  return withAttendanceCount(activity);
}

export async function createActivity(input: {
  actor: Actor;
  seasonId?: string;
  name: string;
  description?: string;
  activityType?: ActivityType;
  startsAt: Date;
  registrationStart: Date;
  registrationEnd: Date;
  individualPoints: number;
  approvalMode?: ApprovalMode;
  status?: ActivityStatus;
  committeeId?: string | null;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  return insertActivity({
    ...input,
    status: input.status ?? "OPEN",
    needsApproval: false,
  });
}

export async function proposeActivity(input: {
  actor: Actor;
  committeeId: string;
  seasonId?: string;
  name: string;
  description?: string;
  activityType?: ActivityType;
  startsAt: Date;
  registrationStart: Date;
  registrationEnd: Date;
  individualPoints: number;
  approvalMode?: ApprovalMode;
  ip?: string | null;
}) {
  requireCommitteeLeader(input.actor, input.committeeId);
  const committee = await db.orm.public.Committee.first({ id: input.committeeId });
  if (!committee || committee.status !== "ACTIVE") {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }
  return insertActivity({
    ...input,
    status: "DRAFT",
    needsApproval: true,
    committeeId: input.committeeId,
  });
}

async function insertActivity(input: {
  actor: Actor;
  seasonId?: string;
  name: string;
  description?: string;
  activityType?: ActivityType;
  startsAt: Date;
  registrationStart: Date;
  registrationEnd: Date;
  individualPoints: number;
  approvalMode?: ApprovalMode;
  status: ActivityStatus;
  committeeId?: string | null;
  needsApproval: boolean;
  ip?: string | null;
}) {
  const season = await resolveSeason(input.seasonId);
  if (!season) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No hay una temporada activa.", 404);
  }
  const fields = parseActivityFields({
    name: input.name,
    individualPoints: input.individualPoints,
    startsAt: input.startsAt,
    registrationStart: input.registrationStart,
    registrationEnd: input.registrationEnd,
  });

  return db.transaction(async (tx) => {
    await lockWritableSeason(tx, season.id);
    const activity = await tx.orm.public.Activity.create({
      publicId: createPublicId(),
      seasonId: season.id,
      name: fields.name,
      description: input.description?.trim() || null,
      activityType: input.activityType ?? "GENERAL",
      startsAt: toIso(fields.startsAt),
      registrationStart: toIso(fields.registrationStart),
      registrationEnd: toIso(fields.registrationEnd),
      individualPoints: fields.individualPoints,
      approvalMode: input.approvalMode ?? "AUTO",
      status: input.status,
      committeeId: input.committeeId ?? null,
      needsApproval: input.needsApproval,
      createdById: input.actor.id,
    });

    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: input.needsApproval ? "ACTIVITY_PROPOSED" : "ACTIVITY_CREATED",
      entityType: "Activity",
      entityId: activity.id,
      after: {
        name: activity.name,
        status: activity.status,
        points: activity.individualPoints,
        approvalMode: activity.approvalMode,
        committeeId: activity.committeeId,
      },
      ip: input.ip,
    });
    return activity;
  });
}

export async function updateActivity(input: {
  actor: Actor;
  activityId: string;
  name?: string;
  description?: string | null;
  startsAt?: Date;
  registrationStart?: Date;
  registrationEnd?: Date;
  individualPoints?: number;
  approvalMode?: ApprovalMode;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await db.orm.public.Activity.where({ id: input.activityId })
    .include("season", (season) => season.select("status"))
    .first();
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  const fields = parseActivityFields({
    name: input.name ?? current.name,
    individualPoints: input.individualPoints ?? current.individualPoints,
    startsAt: input.startsAt ?? toDate(current.startsAt),
    registrationStart: input.registrationStart ?? toDate(current.registrationStart),
    registrationEnd: input.registrationEnd ?? toDate(current.registrationEnd),
  });

  assertActivityMutable(current.status);
  if (
    current.status !== "DRAFT" &&
    (fields.individualPoints !== current.individualPoints ||
      (input.approvalMode ?? current.approvalMode) !== current.approvalMode)
  ) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "Los puntos y el modo de aprobación quedan fijos al publicar la actividad.",
      409
    );
  }
  if (
    current.status === "CLOSED" &&
    (fields.startsAt.getTime() !== toDate(current.startsAt).getTime() ||
      fields.registrationStart.getTime() !== toDate(current.registrationStart).getTime() ||
      fields.registrationEnd.getTime() !== toDate(current.registrationEnd).getTime())
  ) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "Al cerrar la actividad solo se pueden corregir el nombre y la descripción.",
      409
    );
  }

  const activity = await db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    if (locked.status !== current.status) {
      throw new DomainError(ErrorCodes.CONFLICT, "La actividad cambió de estado.", 409);
    }
    const updated = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        name: fields.name,
        description:
          input.description === undefined ? locked.description : input.description?.trim() || null,
        startsAt: toIso(fields.startsAt),
        registrationStart: toIso(fields.registrationStart),
        registrationEnd: toIso(fields.registrationEnd),
        individualPoints: fields.individualPoints,
        approvalMode: input.approvalMode ?? locked.approvalMode,
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "ACTIVITY_UPDATED",
      entityType: "Activity",
      entityId: updated.id,
      before: {
        name: locked.name,
        status: locked.status,
        points: locked.individualPoints,
      },
      after: {
        name: updated.name,
        status: updated.status,
        points: updated.individualPoints,
      },
      ip: input.ip,
    });
    return updated;
  });

  await recomputeActivityScores(activity.id);
  return activity;
}

export async function rotateActivityPublicId(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await getWritableActivity(input.activityId);
  const nextPublicId = createPublicId();
  const activity = await db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    assertActivityMutable(locked.status);
    await tx.orm.public.ActivityPublicIdHistory.create({
      activityId: locked.id,
      publicId: locked.publicId,
    });
    const updated = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        publicId: nextPublicId,
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "ACTIVITY_QR_ROTATED",
      entityType: "Activity",
      entityId: updated.id,
      before: { publicId: locked.publicId },
      after: { publicId: updated.publicId },
      ip: input.ip,
    });
    return updated;
  });
  return activity;
}

type ActivityForwardStatus = Extract<ActivityStatus, "OPEN" | "CLOSED" | "PROCESSED">;

async function transitionActivityInternal(input: {
  actor: Actor;
  activityId: string;
  to: ActivityForwardStatus;
  requireProposal?: boolean;
  action?: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await db.orm.public.Activity.first({ id: input.activityId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  return db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    if (input.requireProposal && !locked.needsApproval) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        "Esa actividad no está en cola de aprobación.",
        400
      );
    }
    assertActivityTransition(locked.status, input.to);
    if (input.to === "PROCESSED") {
      const { total } = await tx.orm.public.Attendance.where({
        activityId: locked.id,
        status: "PENDING",
      }).aggregate((aggregate) => ({ total: aggregate.count() }));
      if (total > 0) {
        throw new DomainError(
          ErrorCodes.CONFLICT,
          "Resuelve todas las asistencias pendientes antes de procesar la actividad.",
          409
        );
      }
    }

    const activity = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        status: input.to,
        needsApproval: input.to === "OPEN" ? false : locked.needsApproval,
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: input.action ?? `ACTIVITY_${input.to}`,
      entityType: "Activity",
      entityId: activity.id,
      before: { status: locked.status, needsApproval: locked.needsApproval },
      after: { status: activity.status, needsApproval: activity.needsApproval },
      ip: input.ip,
    });
    return activity;
  });
}

export async function transitionActivity(input: {
  actor: Actor;
  activityId: string;
  to: ActivityForwardStatus;
  ip?: string | null;
}) {
  return transitionActivityInternal(input);
}

export async function publishProposedActivity(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  return transitionActivityInternal({
    ...input,
    to: "OPEN",
    requireProposal: true,
    action: "ACTIVITY_PROPOSAL_APPROVED",
  });
}

export async function cancelActivity(input: {
  actor: Actor;
  activityId: string;
  reason: string;
  action?: string;
  expectedStatus?: ActivityStatus;
  requireNeedsApproval?: boolean;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const reason = input.reason.trim();
  if (!reason) {
    throw new DomainError(ErrorCodes.REASON_REQUIRED, "Indica el motivo de cancelación.", 400);
  }
  const current = await db.orm.public.Activity.first({ id: input.activityId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  // A cancellation retry is a read-only no-op, even if the season was closed
  // after the original commit. The first cancellation already serialized the
  // activity, attendance reversals and audit entries.
  if (current.status === "CANCELLED") return current;

  const result = await db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    if (
      (input.expectedStatus && locked.status !== input.expectedStatus) ||
      (input.requireNeedsApproval && !locked.needsApproval)
    ) {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "La actividad cambió mientras se procesaba la decisión.",
        409
      );
    }
    if (locked.status === "CANCELLED") {
      const memberIds: string[] = [];
      return { activity: locked, changed: false, memberIds };
    }
    assertActivityTransition(locked.status, "CANCELLED");

    const attendances = await tx.orm.public.Attendance.where({ activityId: locked.id })
      .where((attendance) => attendance.status.in(["PENDING", "APPROVED"]))
      .all();
    const now = isoNow();
    for (const attendance of attendances) {
      const updated = await tx.orm.public.Attendance.where({
        id: attendance.id,
        status: attendance.status,
      }).update({
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason,
      });
      if (!updated) {
        throw new DomainError(
          ErrorCodes.CONFLICT,
          "Una asistencia cambió mientras se cancelaba la actividad.",
          409
        );
      }
      if (attendance.status === "APPROVED") {
        await syncAttendanceCredit(tx, {
          attendanceId: attendance.id,
          memberId: attendance.memberId,
          activity: locked,
          status: "CANCELLED",
          createdById: input.actor.id,
          reversalReason: `Cancelación de actividad: ${locked.name}. ${reason}`,
        });
      }
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action: "ATTENDANCE_CANCELLED_BY_ACTIVITY",
        entityType: "Attendance",
        entityId: attendance.id,
        before: { status: attendance.status },
        after: { status: "CANCELLED", reason },
        ip: input.ip,
      });
    }

    const activity = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        status: "CANCELLED",
        needsApproval: false,
        cancelledAt: now,
        cancelReason: reason,
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: input.action ?? "ACTIVITY_CANCELLED",
      entityType: "Activity",
      entityId: activity.id,
      before: { status: locked.status, needsApproval: locked.needsApproval },
      after: { status: activity.status, reason },
      ip: input.ip,
    });
    return {
      activity,
      changed: true,
      memberIds: [...new Set(attendances.map((attendance) => attendance.memberId))],
    };
  });

  if (result.changed) {
    if (result.memberIds.length === 0) {
      await recomputeActivityScores(result.activity.id);
    } else {
      for (const memberId of result.memberIds) {
        await runAttendanceEffects({
          activityId: result.activity.id,
          seasonId: result.activity.seasonId,
          memberId,
        });
      }
    }
  }
  return result.activity;
}

export async function rejectProposedActivity(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  const current = await db.orm.public.Activity.first({ id: input.activityId });
  if (!current?.needsApproval || current.status !== "DRAFT") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Esa actividad no está en cola de aprobación.",
      400
    );
  }
  return cancelActivity({
    ...input,
    reason: "Propuesta rechazada por GH General.",
    action: "ACTIVITY_PROPOSAL_REJECTED",
    expectedStatus: "DRAFT",
    requireNeedsApproval: true,
  });
}

export async function listProposedActivities(seasonId?: string) {
  const resolvedSeasonId = seasonId ?? (await getActiveSeason())?.id;
  if (!resolvedSeasonId) return [];
  return db.orm.public.Activity.where({
    seasonId: resolvedSeasonId,
    needsApproval: true,
    status: "DRAFT",
  })
    .include("committee", (committee) => committee.select("name", "slug"))
    .include("createdBy", (member) => member.select("fullName"))
    .orderBy((activity) => activity.createdAt.asc())
    .all();
}

export async function listLeaderProposedActivities(actor: Actor, committeeId: string) {
  requireCommitteeLeader(actor, committeeId);
  let collection = db.orm.public.Activity.where({ committeeId });
  if (!isAdmin(actor)) {
    collection = collection.where({ createdById: actor.id });
  }
  return collection.orderBy((activity) => activity.createdAt.desc()).limit(20).all();
}

export async function rotateAttendanceToken(input: {
  actor: Actor;
  activityId: string;
  enable?: boolean;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await getWritableActivity(input.activityId);
  const token = generateAttendanceToken();
  const activity = await db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    if (locked.status !== "DRAFT" && locked.status !== "OPEN") {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "El token solo se puede configurar antes de cerrar la actividad.",
        409
      );
    }
    const updated = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        requireAttendanceToken: input.enable ?? true,
        attendanceTokenHash: hashAttendanceToken(locked.id, token),
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "ACTIVITY_TOKEN_ROTATED",
      entityType: "Activity",
      entityId: updated.id,
      after: { requireAttendanceToken: updated.requireAttendanceToken },
      ip: input.ip,
    });
    return updated;
  });
  return { activity, token };
}

export async function disableAttendanceToken(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await getWritableActivity(input.activityId);
  const activity = await db.transaction(async (tx) => {
    await lockWritableSeason(tx, current.seasonId);
    const locked = await lockActivityRow(tx, current.id);
    if (locked.status === "PROCESSED" || locked.status === "CANCELLED") {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Las actividades procesadas o canceladas son de solo lectura.",
        409
      );
    }
    const updated = requireUnchangedActivity(
      await tx.orm.public.Activity.where({ id: locked.id, status: locked.status }).update({
        requireAttendanceToken: false,
        attendanceTokenHash: null,
      })
    );
    await writeAuditLog(tx, {
      actorId: input.actor.id,
      action: "ACTIVITY_TOKEN_DISABLED",
      entityType: "Activity",
      entityId: updated.id,
      ip: input.ip,
    });
    return updated;
  });
  return activity;
}

export function attendanceUrl(baseUrl: string, publicId: string, token?: string | null) {
  const url = `${baseUrl}/a/${publicId}`;
  if (!token) return url;
  return `${url}?t=${encodeURIComponent(token)}`;
}

export function assertAttendanceToken(
  activity: { id: string; requireAttendanceToken: boolean; attendanceTokenHash: string | null },
  token: string | null | undefined
) {
  if (!activity.requireAttendanceToken) return;
  if (!activity.attendanceTokenHash || !token) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "Este QR ya no es válido. Pide el código actualizado.",
      403
    );
  }
  const expected = hashAttendanceToken(activity.id, token);
  if (!safeEqual(expected, activity.attendanceTokenHash)) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "Este QR ya no es válido. Pide el código actualizado.",
      403
    );
  }
}

const MEMBER_VISIBLE_STATUSES: ActivityStatus[] = [
  "OPEN",
  "CLOSED",
  "PROCESSED",
  "CANCELLED",
];

export async function listPublishedActivities(seasonId?: string) {
  const resolvedSeasonId = seasonId ?? (await getActiveSeason())?.id;
  if (!resolvedSeasonId) return [];
  const rows = await db.orm.public.Activity.where({ seasonId: resolvedSeasonId })
    .where((activity) => activity.status.in(MEMBER_VISIBLE_STATUSES))
    .include("attendances", (attendances) => attendances.count())
    .include("season")
    .orderBy((activity) => activity.startsAt.desc())
    .all();
  return rows.map(withAttendanceCount);
}

export async function getPublishedActivityById(id: string) {
  const activity = await getActivityById(id);
  if (!activity) return null;
  const visible = MEMBER_VISIBLE_STATUSES.some((status) => status === activity.status);
  return visible ? activity : null;
}

export async function getNextOpenActivity(seasonId?: string) {
  const resolvedSeasonId = seasonId ?? (await getActiveSeason())?.id;
  if (!resolvedSeasonId) return null;
  return db.orm.public.Activity.where({ seasonId: resolvedSeasonId, status: "OPEN" })
    .where((activity) => activity.startsAt.gte(isoNow()))
    .orderBy((activity) => activity.startsAt.asc())
    .first();
}

export async function getOpenActivities(seasonId?: string) {
  const resolvedSeasonId = seasonId ?? (await getActiveSeason())?.id;
  if (!resolvedSeasonId) return [];
  const now = isoNow();
  return db.orm.public.Activity.where({ seasonId: resolvedSeasonId, status: "OPEN" })
    .where((activity) =>
      and(activity.registrationStart.lte(now), activity.registrationEnd.gte(now))
    )
    .orderBy((activity) => activity.startsAt.asc())
    .all();
}
