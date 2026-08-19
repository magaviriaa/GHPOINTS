import "server-only";

import { z } from "zod";
import type { ActivityStatus, ActivityType, ApprovalMode } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { createPublicId } from "@/lib/public-id";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { getActiveSeason, resolveSeason, assertSeasonWritable } from "@/server/domain/season";
import { recomputeActivityScores } from "@/server/domain/scoring";
import type { Actor } from "@/server/domain/authorization";
import { isAdmin, requireAdmin, requireCommitteeLeader } from "@/server/domain/authorization";
import {
  generateAttendanceToken,
  hashAttendanceToken,
  safeEqual,
} from "@/server/auth/secrets";

const MAX_INDIVIDUAL_POINTS = 10_000;

const activityFieldsSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre de la actividad es obligatorio."),
    individualPoints: z
      .number({ invalid_type_error: "Los GH Points deben ser un número." })
      .int("Los GH Points deben ser un número entero.")
      .min(0, "Los GH Points no pueden ser negativos.")
      .max(MAX_INDIVIDUAL_POINTS, `Los GH Points no pueden superar ${MAX_INDIVIDUAL_POINTS}.`),
    startsAt: z.date({ invalid_type_error: "La fecha de la actividad no es válida." }),
    registrationStart: z.date({
      invalid_type_error: "La apertura del registro no es una fecha válida.",
    }),
    registrationEnd: z.date({
      invalid_type_error: "El cierre del registro no es una fecha válida.",
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

export async function listActivities(filters?: {
  seasonId?: string;
  status?: ActivityStatus;
}) {
  const seasonId = filters?.seasonId ?? (await getActiveSeason())?.id;
  if (!seasonId) return [];
  return prisma.activity.findMany({
    where: {
      seasonId,
      status: filters?.status,
    },
    include: {
      _count: { select: { attendances: true } },
      season: true,
    },
    orderBy: { startsAt: "desc" },
  });
}

export async function getActivityByPublicId(publicId: string) {
  return prisma.activity.findUnique({
    where: { publicId },
    include: { season: true },
  });
}

export async function getActivityById(id: string) {
  return prisma.activity.findUnique({
    where: { id },
    include: {
      season: true,
      committee: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { fullName: true } },
      publicIdHistory: { orderBy: { retiredAt: "desc" }, take: 12 },
      _count: { select: { attendances: true } },
    },
  });
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
  const committee = await prisma.committee.findUnique({ where: { id: input.committeeId } });
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
  assertSeasonWritable(season.status);

  const fields = parseActivityFields({
    name: input.name,
    individualPoints: input.individualPoints,
    startsAt: input.startsAt,
    registrationStart: input.registrationStart,
    registrationEnd: input.registrationEnd,
  });

  const activity = await prisma.activity.create({
    data: {
      publicId: createPublicId(),
      seasonId: season.id,
      name: fields.name,
      description: input.description?.trim() || null,
      activityType: input.activityType ?? "GENERAL",
      startsAt: fields.startsAt,
      registrationStart: fields.registrationStart,
      registrationEnd: fields.registrationEnd,
      individualPoints: fields.individualPoints,
      approvalMode: input.approvalMode ?? "AUTO",
      status: input.status,
      committeeId: input.committeeId ?? null,
      needsApproval: input.needsApproval,
      createdById: input.actor.id,
    },
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: input.needsApproval ? "ACTIVITY_PROPOSED" : "ACTIVITY_CREATED",
    entityType: "Activity",
    entityId: activity.id,
    after: {
      name: activity.name,
      points: activity.individualPoints,
      approvalMode: activity.approvalMode,
      committeeId: activity.committeeId,
    },
    ip: input.ip,
  });
  return activity;
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
  status?: ActivityStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.activity.findUnique({
    where: { id: input.activityId },
    include: { season: true },
  });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  const fields = parseActivityFields({
    name: input.name ?? current.name,
    individualPoints: input.individualPoints ?? current.individualPoints,
    startsAt: input.startsAt ?? current.startsAt,
    registrationStart: input.registrationStart ?? current.registrationStart,
    registrationEnd: input.registrationEnd ?? current.registrationEnd,
  });

  const activity = await prisma.activity.update({
    where: { id: input.activityId },
    data: {
      name: fields.name,
      description:
        input.description === undefined ? current.description : input.description,
      startsAt: fields.startsAt,
      registrationStart: fields.registrationStart,
      registrationEnd: fields.registrationEnd,
      individualPoints: fields.individualPoints,
      approvalMode: input.approvalMode ?? current.approvalMode,
      status: input.status ?? current.status,
    },
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_UPDATED",
    entityType: "Activity",
    entityId: activity.id,
    before: {
      name: current.name,
      status: current.status,
      points: current.individualPoints,
    },
    after: {
      name: activity.name,
      status: activity.status,
      points: activity.individualPoints,
    },
    ip: input.ip,
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
  const current = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  const nextPublicId = createPublicId();
  const activity = await prisma.$transaction(async (tx) => {
    await tx.activityPublicIdHistory.create({
      data: { activityId: current.id, publicId: current.publicId },
    });
    return tx.activity.update({
      where: { id: input.activityId },
      data: { publicId: nextPublicId },
    });
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_QR_ROTATED",
    entityType: "Activity",
    entityId: activity.id,
    before: { publicId: current.publicId },
    after: { publicId: activity.publicId },
    ip: input.ip,
  });
  return activity;
}

export async function publishProposedActivity(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  if (!current.needsApproval || current.status !== "DRAFT") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Esa actividad no está en cola de aprobación.",
      400
    );
  }
  const activity = await prisma.activity.update({
    where: { id: current.id },
    data: { status: "OPEN", needsApproval: false },
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_PROPOSAL_APPROVED",
    entityType: "Activity",
    entityId: activity.id,
    before: { status: current.status, needsApproval: current.needsApproval },
    after: { status: activity.status, needsApproval: activity.needsApproval },
    ip: input.ip,
  });
  return activity;
}

export async function rejectProposedActivity(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  if (!current.needsApproval || current.status !== "DRAFT") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Esa actividad no está en cola de aprobación.",
      400
    );
  }
  const activity = await prisma.activity.update({
    where: { id: current.id },
    data: { status: "CANCELLED", needsApproval: false },
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_PROPOSAL_REJECTED",
    entityType: "Activity",
    entityId: activity.id,
    before: { status: current.status },
    after: { status: activity.status },
    ip: input.ip,
  });
  return activity;
}

export async function listProposedActivities(seasonId?: string) {
  const resolvedSeasonId = seasonId ?? (await getActiveSeason())?.id;
  if (!resolvedSeasonId) return [];
  return prisma.activity.findMany({
    where: { seasonId: resolvedSeasonId, needsApproval: true, status: "DRAFT" },
    include: {
      committee: { select: { name: true, slug: true } },
      createdBy: { select: { fullName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function listLeaderProposedActivities(actor: Actor, committeeId: string) {
  requireCommitteeLeader(actor, committeeId);
  return prisma.activity.findMany({
    where: { committeeId, createdById: isAdmin(actor) ? undefined : actor.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function rotateAttendanceToken(input: {
  actor: Actor;
  activityId: string;
  enable?: boolean;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  const token = generateAttendanceToken();
  const activity = await prisma.activity.update({
    where: { id: current.id },
    data: {
      requireAttendanceToken: input.enable ?? true,
      attendanceTokenHash: hashAttendanceToken(current.id, token),
    },
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_TOKEN_ROTATED",
    entityType: "Activity",
    entityId: activity.id,
    after: { requireAttendanceToken: activity.requireAttendanceToken },
    ip: input.ip,
  });
  return { activity, token };
}

export async function disableAttendanceToken(input: {
  actor: Actor;
  activityId: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.activity.findUnique({ where: { id: input.activityId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  const activity = await prisma.activity.update({
    where: { id: current.id },
    data: { requireAttendanceToken: false, attendanceTokenHash: null },
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "ACTIVITY_TOKEN_DISABLED",
    entityType: "Activity",
    entityId: activity.id,
    ip: input.ip,
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
  return prisma.activity.findMany({
    where: {
      seasonId: resolvedSeasonId,
      status: { in: MEMBER_VISIBLE_STATUSES },
    },
    include: {
      _count: { select: { attendances: true } },
      season: true,
    },
    orderBy: { startsAt: "desc" },
  });
}

export async function getPublishedActivityById(id: string) {
  const activity = await getActivityById(id);
  if (!activity) return null;
  const visible = MEMBER_VISIBLE_STATUSES.some((status) => status === activity.status);
  return visible ? activity : null;
}

export async function getNextOpenActivity() {
  return prisma.activity.findFirst({
    where: { status: "OPEN", startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
}

export async function getOpenActivities() {
  return prisma.activity.findMany({
    where: { status: "OPEN" },
    orderBy: { startsAt: "asc" },
  });
}
