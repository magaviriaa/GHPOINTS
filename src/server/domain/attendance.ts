import "server-only";

import type {
  ActivityStatus,
  AttendanceSource,
  AttendanceStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { isUniqueConstraint } from "@/server/db/errors";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import {
  assertAttendanceTransition,
  syncAttendanceCredit,
  type AttendanceCreditActivity,
} from "@/server/domain/attendance-credit";
import { getActivityByPublicId, assertAttendanceToken } from "@/server/domain/activities";
import { listActiveMemberships } from "@/server/domain/members";
import {
  runAttendanceEffects,
  scheduleAttendanceEffects,
} from "@/server/domain/attendance-effects";
import { writeAuditLog } from "@/server/domain/audit";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { dispatchAppEvent } from "@/server/notify/events";

type TransactionClient = Prisma.TransactionClient;

type AttendanceWithActivity = {
  id: string;
  memberId: string;
  activityId: string;
  status: AttendanceStatus;
  activity: AttendanceCreditActivity;
};

function assertRegistrationWindow(now: Date, start: Date, end: Date, bypass: boolean) {
  if (bypass) return;
  if (now < start || now > end) {
    throw new DomainError(
      ErrorCodes.REGISTRATION_CLOSED,
      "El registro para esta actividad está cerrado.",
      400
    );
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- unique-constraint catch seam
function rethrowDuplicateAttendance(error: unknown, message: string): never {
  if (isUniqueConstraint(error)) {
    throw new DomainError(ErrorCodes.ALREADY_REGISTERED, message, 409);
  }
  throw error;
}

function attendanceStatusPatch(
  to: AttendanceStatus,
  actorId: string,
  now: Date,
  reason?: string
): Prisma.AttendanceUncheckedUpdateInput {
  switch (to) {
    case "APPROVED":
      return {
        status: "APPROVED",
        approvedAt: now,
        approvedById: actorId,
        cancelledAt: null,
        cancelReason: null,
      };
    case "REJECTED":
      return { status: "REJECTED" };
    case "CANCELLED":
      return {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason ?? null,
      };
    case "PENDING":
      return { status: "PENDING" };
    default: {
      const _exhaustive: never = to;
      return _exhaustive;
    }
  }
}

function creditReversalReason(
  to: AttendanceStatus,
  activityName: string,
  reason?: string
): string | undefined {
  switch (to) {
    case "APPROVED":
    case "PENDING":
      return undefined;
    case "REJECTED":
      return `Rechazo de asistencia: ${activityName}`;
    case "CANCELLED":
      return reason;
    default: {
      const _exhaustive: never = to;
      return _exhaustive;
    }
  }
}

async function insertAttendanceWithCredit(
  tx: TransactionClient,
  input: {
    activity: AttendanceCreditActivity;
    memberId: string;
    actorId: string;
    source: AttendanceSource;
    now: Date;
    autoApprove: boolean;
  }
) {
  const status: AttendanceStatus = input.autoApprove ? "APPROVED" : "PENDING";
  const created = await tx.attendance.create({
    data: {
      activityId: input.activity.id,
      memberId: input.memberId,
      status,
      registeredAt: input.now,
      approvedAt: input.autoApprove ? input.now : null,
      approvedById: input.autoApprove ? input.actorId : null,
      source: input.source,
    },
  });

  await syncAttendanceCredit(tx, {
    attendanceId: created.id,
    memberId: created.memberId,
    activity: input.activity,
    status: created.status,
    createdById: input.actorId,
  });

  return created;
}

async function applyAttendanceStatus(
  tx: TransactionClient,
  input: {
    attendance: AttendanceWithActivity;
    to: AttendanceStatus;
    actorId: string;
    now: Date;
    reason?: string;
  }
) {
  assertAttendanceTransition(input.attendance.status, input.to);

  const updated = await tx.attendance.update({
    where: { id: input.attendance.id },
    data: attendanceStatusPatch(input.to, input.actorId, input.now, input.reason),
  });

  await syncAttendanceCredit(tx, {
    attendanceId: input.attendance.id,
    memberId: input.attendance.memberId,
    activity: input.attendance.activity,
    status: input.to,
    createdById: input.actorId,
    reversalReason: creditReversalReason(input.to, input.attendance.activity.name, input.reason),
  });

  return updated;
}

export async function upsertApprovedAttendance(
  tx: TransactionClient,
  input: {
    activity: AttendanceCreditActivity;
    memberId: string;
    actorId: string;
    now: Date;
    source?: AttendanceSource;
  }
) {
  const existing = await tx.attendance.findUnique({
    where: {
      activityId_memberId: { activityId: input.activity.id, memberId: input.memberId },
    },
  });
  if (existing) {
    assertAttendanceTransition(existing.status, "APPROVED");
  }

  const attendance = await tx.attendance.upsert({
    where: {
      activityId_memberId: { activityId: input.activity.id, memberId: input.memberId },
    },
    update: {
      status: "APPROVED",
      approvedAt: input.now,
      approvedById: input.actorId,
    },
    create: {
      activityId: input.activity.id,
      memberId: input.memberId,
      status: "APPROVED",
      registeredAt: input.now,
      approvedAt: input.now,
      approvedById: input.actorId,
      source: input.source ?? "ADMIN",
    },
  });

  await syncAttendanceCredit(tx, {
    attendanceId: attendance.id,
    memberId: input.memberId,
    activity: input.activity,
    status: "APPROVED",
    createdById: input.actorId,
  });
  return attendance;
}

async function runEffectsForAttendances(
  rows: Array<{ activityId: string; memberId: string; activity: { seasonId: string } }>
) {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.activityId}:${row.memberId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await runAttendanceEffects({
      activityId: row.activityId,
      seasonId: row.activity.seasonId,
      memberId: row.memberId,
    });
  }
}

export async function registerAttendance(input: {
  actor: Actor;
  activityId?: string;
  publicId?: string;
  token?: string | null;
  source: Extract<AttendanceSource, "QR" | "LINK">;
}) {
  const activity = await prisma.activity.findFirst({
    where: input.activityId ? { id: input.activityId } : { publicId: input.publicId },
    include: { season: true },
  });

  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  if (activity.season.status === "CLOSED") {
    throw new DomainError(
      ErrorCodes.SEASON_CLOSED,
      "Esta temporada ya está cerrada.",
      400
    );
  }

  if (activity.status === "CANCELLED") {
    throw new DomainError(
      ErrorCodes.ACTIVITY_CANCELLED,
      "Esta actividad fue cancelada.",
      400
    );
  }

  if (activity.status !== "OPEN") {
    throw new DomainError(
      ErrorCodes.ACTIVITY_NOT_OPEN,
      "El registro para esta actividad está cerrado.",
      400
    );
  }

  assertAttendanceToken(activity, input.token ?? null);

  const now = new Date();
  assertRegistrationWindow(now, activity.registrationStart, activity.registrationEnd, false);

  const attendance = await prisma
    .$transaction((tx) =>
      insertAttendanceWithCredit(tx, {
        activity,
        memberId: input.actor.id,
        actorId: input.actor.id,
        source: input.source,
        now,
        autoApprove: activity.approvalMode === "AUTO",
      })
    )
    .catch((error) => rethrowDuplicateAttendance(error, "Ya registraste tu asistencia."));

  scheduleAttendanceEffects({
    activityId: activity.id,
    seasonId: activity.seasonId,
    memberId: input.actor.id,
  });
  dispatchAppEvent({
    type: "ATTENDANCE_REGISTERED",
    memberEmail: input.actor.institutionalEmail,
    memberName: input.actor.fullName,
    activityName: activity.name,
    status: attendance.status,
    points: activity.individualPoints,
  });
  return attendance;
}

export async function adminRegisterAttendance(input: {
  actor: Actor;
  activityId: string;
  memberId: string;
  source?: AttendanceSource;
  ip?: string | null;
}) {
  requireAdmin(input.actor);

  const activity = await prisma.activity.findUnique({
    where: { id: input.activityId },
    include: { season: true },
  });
  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  const member = await prisma.member.findUnique({ where: { id: input.memberId } });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const now = new Date();

  const attendance = await prisma
    .$transaction((tx) =>
      insertAttendanceWithCredit(tx, {
        activity,
        memberId: member.id,
        actorId: input.actor.id,
        source: input.source ?? "ADMIN",
        now,
        autoApprove: activity.approvalMode === "AUTO",
      })
    )
    .catch((error) =>
      rethrowDuplicateAttendance(error, "Ese integrante ya tiene asistencia en esta actividad.")
    );

  await writeAuditLog({
    actorId: input.actor.id,
    action: "ATTENDANCE_CREATED",
    entityType: "Attendance",
    entityId: attendance.id,
    after: { memberId: member.id, activityId: activity.id, source: attendance.source },
    ip: input.ip,
  });
  await runAttendanceEffects({
    activityId: activity.id,
    seasonId: activity.seasonId,
    memberId: member.id,
  });
  return attendance;
}

export type AttendanceDecision = Extract<
  AttendanceStatus,
  "APPROVED" | "REJECTED" | "CANCELLED"
>;

function auditActionFor(decision: AttendanceDecision): string {
  switch (decision) {
    case "APPROVED":
      return "ATTENDANCE_APPROVED";
    case "REJECTED":
      return "ATTENDANCE_REJECTED";
    case "CANCELLED":
      return "ATTENDANCE_CANCELLED";
    default: {
      const _exhaustive: never = decision;
      return _exhaustive;
    }
  }
}

async function notifyApproved(
  rows: Array<{
    memberId: string;
    activity: { name: string; individualPoints: number };
  }>
) {
  const memberIds = Array.from(new Set(rows.map((row) => row.memberId)));
  const members = await prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, institutionalEmail: true, fullName: true },
  });
  const byId = new Map(members.map((member) => [member.id, member]));

  for (const row of rows) {
    const member = byId.get(row.memberId);
    if (!member) continue;
    dispatchAppEvent({
      type: "ATTENDANCE_APPROVED",
      memberEmail: member.institutionalEmail,
      memberName: member.fullName,
      activityName: row.activity.name,
      points: row.activity.individualPoints,
    });
  }
}

/**
 * The single admin decision over Asistencia. One id or many take the same path:
 * every transition is checked before the transaction opens, the whole batch
 * moves atomically, each row gets its own audit entry, and approval notifies
 * the Integrante whether it was decided alone or in bulk (ADR-023).
 */
export async function decideAttendance(input: {
  actor: Actor;
  attendanceIds: string[];
  to: AttendanceDecision;
  reason?: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);

  const uniqueIds = Array.from(new Set(input.attendanceIds));
  if (uniqueIds.length === 0) return [];

  const reason = input.reason?.trim() ?? "";
  if (input.to === "CANCELLED" && reason.length === 0) {
    throw new DomainError(ErrorCodes.REASON_REQUIRED, "Indica un motivo para anular.", 400);
  }

  const attendances = await prisma.attendance.findMany({
    where: { id: { in: uniqueIds } },
    include: { activity: true },
  });
  const byId = new Map(attendances.map((row) => [row.id, row]));
  const ordered = uniqueIds.map((attendanceId) => {
    const attendance = byId.get(attendanceId);
    if (!attendance) {
      throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa asistencia.", 404);
    }
    assertAttendanceTransition(attendance.status, input.to);
    return attendance;
  });

  const now = new Date();
  const results = await prisma.$transaction(async (tx) => {
    const updated = [];
    for (const attendance of ordered) {
      updated.push(
        await applyAttendanceStatus(tx, {
          attendance,
          to: input.to,
          actorId: input.actor.id,
          now,
          reason: reason.length > 0 ? reason : undefined,
        })
      );
    }
    return updated;
  });

  const action = auditActionFor(input.to);
  for (const attendance of ordered) {
    await writeAuditLog({
      actorId: input.actor.id,
      action,
      entityType: "Attendance",
      entityId: attendance.id,
      before: { status: attendance.status },
      after: reason.length > 0 ? { status: input.to, reason } : { status: input.to },
      ip: input.ip,
    });
  }

  await runEffectsForAttendances(ordered);
  if (input.to === "APPROVED") {
    await notifyApproved(ordered);
  }
  return results;
}

export async function listActivityAttendances(
  activityId: string,
  filters?: {
    query?: string;
    status?: Prisma.AttendanceWhereInput["status"];
    committeeId?: string;
  }
) {
  return prisma.attendance.findMany({
    where: {
      activityId,
      status: filters?.status,
      member: {
        fullName: filters?.query
          ? { contains: filters.query, mode: "insensitive" }
          : undefined,
        committees: filters?.committeeId
          ? { some: { committeeId: filters.committeeId, isActive: true } }
          : undefined,
      },
    },
    include: {
      member: {
        include: {
          committees: {
            where: { isActive: true },
            include: { committee: true },
          },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
  });
}

export function isRegistrationOpen(
  activity: { status: ActivityStatus; registrationStart: Date; registrationEnd: Date },
  now = new Date()
): boolean {
  return (
    activity.status === "OPEN" &&
    now >= activity.registrationStart &&
    now <= activity.registrationEnd
  );
}

export async function countApprovedAttendances(activityId: string) {
  return prisma.attendance.count({
    where: { activityId, status: "APPROVED" },
  });
}

export async function listPendingAttendances(seasonId?: string) {
  return prisma.attendance.findMany({
    where: {
      status: "PENDING",
      activity: { seasonId },
    },
    include: {
      member: true,
      activity: true,
    },
    orderBy: { registeredAt: "desc" },
  });
}

export async function getPublicActivityRegistration(
  publicId: string,
  memberId: string,
  token?: string | null
) {
  const activity = await getActivityByPublicId(publicId);
  if (!activity) return null;

  const [attendance, memberships] = await Promise.all([
    prisma.attendance.findUnique({
      where: { activityId_memberId: { activityId: activity.id, memberId } },
    }),
    listActiveMemberships(memberId),
  ]);

  let tokenOk = true;
  if (activity.requireAttendanceToken) {
    try {
      assertAttendanceToken(activity, token ?? null);
    } catch {
      tokenOk = false;
    }
  }

  return {
    activity,
    attendance,
    memberships,
    registrationOpen: isRegistrationOpen(activity) && tokenOk,
    tokenRequired: activity.requireAttendanceToken,
    tokenOk,
  };
}
