import "server-only";

import { and } from "@prisma/orm-postgres/orm-client";
import type {
  ActivityStatus,
  AttendanceSource,
  AttendanceStatus,
} from "@/server/db/types";
import { db, type Tx } from "@/server/db/prisma";
import { toDate, toIso } from "@/server/db/time";
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

type AttendanceWithActivity = {
  id: string;
  memberId: string;
  activityId: string;
  status: AttendanceStatus;
  activity: AttendanceCreditActivity;
};

type AttendanceStatusPatch = {
  status: AttendanceStatus;
  approvedAt?: string | null;
  approvedById?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
};

function assertRegistrationWindow(
  now: Date,
  start: Date | string,
  end: Date | string,
  bypass: boolean
) {
  if (bypass) return;
  const startAt = toDate(start);
  const endAt = toDate(end);
  if (now < startAt || now > endAt) {
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
): AttendanceStatusPatch {
  switch (to) {
    case "APPROVED":
      return {
        status: "APPROVED",
        approvedAt: toIso(now),
        approvedById: actorId,
        cancelledAt: null,
        cancelReason: null,
      };
    case "REJECTED":
      return { status: "REJECTED" };
    case "CANCELLED":
      return {
        status: "CANCELLED",
        cancelledAt: toIso(now),
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
  tx: Tx,
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
  const created = await tx.orm.public.Attendance.create({
    activityId: input.activity.id,
    memberId: input.memberId,
    status,
    registeredAt: toIso(input.now),
    approvedAt: input.autoApprove ? toIso(input.now) : null,
    approvedById: input.autoApprove ? input.actorId : null,
    source: input.source,
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
  tx: Tx,
  input: {
    attendance: AttendanceWithActivity;
    to: AttendanceStatus;
    actorId: string;
    now: Date;
    reason?: string;
  }
) {
  assertAttendanceTransition(input.attendance.status, input.to);

  const updated = await tx.orm.public.Attendance.where({ id: input.attendance.id }).update(
    attendanceStatusPatch(input.to, input.actorId, input.now, input.reason)
  );
  if (!updated) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa asistencia.", 404);
  }

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
  tx: Tx,
  input: {
    activity: AttendanceCreditActivity;
    memberId: string;
    actorId: string;
    now: Date;
    source?: AttendanceSource;
  }
) {
  const existing = await tx.orm.public.Attendance.where({
    activityId: input.activity.id,
    memberId: input.memberId,
  }).first();
  if (existing) {
    assertAttendanceTransition(existing.status, "APPROVED");
  }

  const attendance = await tx.orm.public.Attendance.upsert({
    create: {
      activityId: input.activity.id,
      memberId: input.memberId,
      status: "APPROVED",
      registeredAt: toIso(input.now),
      approvedAt: toIso(input.now),
      approvedById: input.actorId,
      source: input.source ?? "ADMIN",
    },
    update: {
      status: "APPROVED",
      approvedAt: toIso(input.now),
      approvedById: input.actorId,
    },
    conflictOn: { activityId: input.activity.id, memberId: input.memberId },
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
  const activity = input.activityId
    ? await db.orm.public.Activity.where({ id: input.activityId }).include("season").first()
    : await db.orm.public.Activity.where({ publicId: input.publicId }).include("season").first();

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

  const attendance = await db
    .transaction((tx) =>
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

  const activity = await db.orm.public.Activity.where({ id: input.activityId })
    .include("season")
    .first();
  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  const member = await db.orm.public.Member.first({ id: input.memberId });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const now = new Date();

  const attendance = await db
    .transaction((tx) =>
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
  const members =
    memberIds.length === 0
      ? []
      : await db.orm.public.Member.where((member) => member.id.in(memberIds))
          .select("id", "institutionalEmail", "fullName")
          .all();
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

  const attendances = await db.orm.public.Attendance.where((row) => row.id.in(uniqueIds))
    .include("activity", (activity) =>
      activity.select("id", "seasonId", "name", "individualPoints")
    )
    .all();
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
  const results = await db.transaction(async (tx) => {
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
    status?: AttendanceStatus;
    committeeId?: string;
  }
) {
  let memberIds: string[] | undefined;
  if (filters?.query || filters?.committeeId) {
    let members = db.orm.public.Member.select("id");
    if (filters.query) {
      members = members.where((member) => member.fullName.ilike(`%${filters.query}%`));
    }
    if (filters.committeeId) {
      const committeeId = filters.committeeId;
      members = members.where((member) =>
        member.committees.some((membership) =>
          and(membership.committeeId.eq(committeeId), membership.isActive.eq(true))
        )
      );
    }
    const matched = await members.all();
    memberIds = matched.map((member) => member.id);
    if (memberIds.length === 0) return [];
  }

  let collection = db.orm.public.Attendance.where({ activityId })
    .include("member", (member) =>
      member
        .select("id", "fullName")
        .include("committees", (committees) =>
          committees
            .where({ isActive: true })
            .select("id", "committeeId")
            .include("committee", (committee) => committee.select("id", "name"))
        )
    )
    .orderBy((row) => row.registeredAt.desc());

  if (filters?.status) {
    collection = collection.where({ status: filters.status });
  }
  if (memberIds) {
    collection = collection.where((row) => row.memberId.in(memberIds));
  }

  return collection.all();
}

export function isRegistrationOpen(
  activity: {
    status: ActivityStatus;
    registrationStart: Date | string;
    registrationEnd: Date | string;
  },
  now = new Date()
): boolean {
  return (
    activity.status === "OPEN" &&
    now >= toDate(activity.registrationStart) &&
    now <= toDate(activity.registrationEnd)
  );
}

export async function countApprovedAttendances(activityId: string) {
  const { total } = await db.orm.public.Attendance.where({
    activityId,
    status: "APPROVED",
  }).aggregate((aggregate) => ({ total: aggregate.count() }));
  return total;
}

export async function listPendingAttendances(seasonId?: string) {
  let collection = db.orm.public.Attendance.where({ status: "PENDING" })
    .select("id", "registeredAt", "source", "activityId", "memberId")
    .include("member", (member) => member.select("id", "fullName"))
    .include("activity", (activity) => activity.select("id", "name"))
    .orderBy((row) => row.registeredAt.desc());

  if (seasonId) {
    const activities = await db.orm.public.Activity.where({ seasonId }).select("id").all();
    const activityIds = activities.map((activity) => activity.id);
    if (activityIds.length === 0) return [];
    collection = collection.where((row) => row.activityId.in(activityIds));
  }

  return collection.all();
}

export async function getPublicActivityRegistration(
  publicId: string,
  memberId: string,
  token?: string | null
) {
  const activity = await getActivityByPublicId(publicId);
  if (!activity) return null;

  const [attendance, memberships] = await Promise.all([
    db.orm.public.Attendance.where({ activityId: activity.id, memberId }).first(),
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
