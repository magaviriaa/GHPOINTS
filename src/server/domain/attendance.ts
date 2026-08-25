import "server-only";

import { and, or } from "@prisma/orm-postgres/orm-client";
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
import { assertSeasonWritable } from "@/server/domain/season";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { dispatchAppEvent } from "@/server/notify/events";
import { lockActivityRow, lockSeasonRow } from "@/server/domain/locks";

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

function assertActivityAcceptsAdminAttendance(status: ActivityStatus) {
  if (status === "OPEN" || status === "CLOSED") return;
  throw new DomainError(
    status === "CANCELLED" ? ErrorCodes.ACTIVITY_CANCELLED : ErrorCodes.ACTIVITY_NOT_OPEN,
    status === "CANCELLED"
      ? "Esta actividad fue cancelada."
      : "Solo se pueden gestionar asistencias mientras la actividad está abierta o cerrada.",
    409
  );
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

  const updated = await tx.orm.public.Attendance.where({
    id: input.attendance.id,
    status: input.attendance.status,
  }).update(attendanceStatusPatch(input.to, input.actorId, input.now, input.reason));
  if (!updated) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "La asistencia cambió mientras la estabas actualizando. Recarga e inténtalo de nuevo.",
      409
    );
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
    ? await db.orm.public.Activity.where({ id: input.activityId })
        .include("season", (season) => season.select("status"))
        .first()
    : await db.orm.public.Activity.where({ publicId: input.publicId })
        .include("season", (season) => season.select("status"))
        .first();

  if (!activity) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }
  const now = new Date();
  const attendance = await db
    .transaction(async (tx) => {
      const season = await lockSeasonRow(tx, activity.seasonId);
      assertSeasonWritable(season.status);
      const locked = await lockActivityRow(tx, activity.id);
      if (input.publicId && locked.publicId !== input.publicId) {
        throw new DomainError(
          ErrorCodes.NOT_FOUND,
          "Este enlace fue reemplazado. Abre el QR actualizado.",
          404
        );
      }
      if (locked.status === "CANCELLED") {
        throw new DomainError(
          ErrorCodes.ACTIVITY_CANCELLED,
          "Esta actividad fue cancelada.",
          400
        );
      }
      if (locked.status !== "OPEN") {
        throw new DomainError(
          ErrorCodes.ACTIVITY_NOT_OPEN,
          "El registro para esta actividad está cerrado.",
          400
        );
      }
      assertAttendanceToken(locked, input.token ?? null);
      assertRegistrationWindow(now, locked.registrationStart, locked.registrationEnd, false);
      return insertAttendanceWithCredit(tx, {
        activity: locked,
        memberId: input.actor.id,
        actorId: input.actor.id,
        source: input.source,
        now,
        autoApprove: locked.approvalMode === "AUTO",
      });
    })
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
    .include("season", (season) => season.select("status"))
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
    .transaction(async (tx) => {
      const season = await lockSeasonRow(tx, activity.seasonId);
      assertSeasonWritable(season.status);
      const locked = await lockActivityRow(tx, activity.id);
      assertActivityAcceptsAdminAttendance(locked.status);
      const created = await insertAttendanceWithCredit(tx, {
        activity: locked,
        memberId: member.id,
        actorId: input.actor.id,
        source: input.source ?? "ADMIN",
        now,
        autoApprove: locked.approvalMode === "AUTO",
      });
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action: "ATTENDANCE_CREATED",
        entityType: "Attendance",
        entityId: created.id,
        after: { memberId: member.id, activityId: locked.id, source: created.source },
        ip: input.ip,
      });
      return created;
    })
    .catch((error) =>
      rethrowDuplicateAttendance(error, "Ese integrante ya tiene asistencia en esta actividad.")
    );
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

  const discovered = await db.orm.public.Attendance.where((row) => row.id.in(uniqueIds))
    .include("activity", (activity) =>
      activity
        .select("id", "seasonId", "name", "individualPoints")
        .include("season", (season) => season.select("status"))
    )
    .all();
  const discoveredById = new Map(discovered.map((row) => [row.id, row]));
  for (const attendanceId of uniqueIds) {
    const attendance = discoveredById.get(attendanceId);
    if (!attendance) {
      throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa asistencia.", 404);
    }
  }

  const now = new Date();
  const { results, ordered } = await db.transaction(async (tx) => {
    const seasonIds = [...new Set(discovered.map((row) => row.activity.seasonId))].sort();
    for (const seasonId of seasonIds) {
      const season = await lockSeasonRow(tx, seasonId);
      assertSeasonWritable(season.status);
    }
    const activityIds = [...new Set(discovered.map((row) => row.activity.id))].sort();
    for (const activityId of activityIds) {
      const activity = await lockActivityRow(tx, activityId);
      if (input.to === "CANCELLED") {
        if (
          activity.status !== "OPEN" &&
          activity.status !== "CLOSED" &&
          activity.status !== "PROCESSED"
        ) {
          assertActivityAcceptsAdminAttendance(activity.status);
        }
      } else {
        assertActivityAcceptsAdminAttendance(activity.status);
      }
    }

    const currentRows = await tx.orm.public.Attendance.where((row) => row.id.in(uniqueIds))
      .include("activity", (activity) =>
        activity.select("id", "seasonId", "name", "individualPoints")
      )
      .all();
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    const ordered = uniqueIds.map((attendanceId) => {
      const attendance = currentById.get(attendanceId);
      if (!attendance) {
        throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa asistencia.", 404);
      }
      assertAttendanceTransition(attendance.status, input.to);
      return attendance;
    });

    const updatedRows = [];
    const action = auditActionFor(input.to);
    for (const attendance of ordered) {
      updatedRows.push(
        await applyAttendanceStatus(tx, {
          attendance,
          to: input.to,
          actorId: input.actor.id,
          now,
          reason: reason.length > 0 ? reason : undefined,
        })
      );
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action,
        entityType: "Attendance",
        entityId: attendance.id,
        before: { status: attendance.status },
        after: reason.length > 0 ? { status: input.to, reason } : { status: input.to },
        ip: input.ip,
      });
    }
    return { results: updatedRows, ordered };
  });

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
      const pattern = `%${filters.query.trim()}%`;
      members = members.where((member) =>
        or(member.fullName.ilike(pattern), member.institutionalEmail.ilike(pattern))
      );
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
        .select("id", "fullName", "institutionalEmail")
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

export async function listPendingAttendances(filters?: {
  seasonId?: string;
  query?: string;
  committeeId?: string;
  activityId?: string;
}) {
  let memberIds: string[] | undefined;
  if (filters?.query || filters?.committeeId) {
    let members = db.orm.public.Member.select("id");
    if (filters.query) {
      const pattern = `%${filters.query.trim()}%`;
      members = members.where((member) =>
        or(member.fullName.ilike(pattern), member.institutionalEmail.ilike(pattern))
      );
    }
    if (filters.committeeId) {
      const committeeId = filters.committeeId;
      members = members.where((member) =>
        member.committees.some((membership) =>
          and(membership.committeeId.eq(committeeId), membership.isActive.eq(true))
        )
      );
    }
    memberIds = (await members.all()).map((member) => member.id);
    if (memberIds.length === 0) return [];
  }

  let collection = db.orm.public.Attendance.where({ status: "PENDING" })
    .select("id", "registeredAt", "source", "activityId", "memberId")
    .include("member", (member) => member.select("id", "fullName", "institutionalEmail"))
    .include("activity", (activity) => activity.select("id", "name"))
    .orderBy((row) => row.registeredAt.desc());

  if (filters?.seasonId) {
    const activities = await db.orm.public.Activity.where({ seasonId: filters.seasonId })
      .select("id")
      .all();
    const activityIds = activities.map((activity) => activity.id);
    if (activityIds.length === 0) return [];
    collection = collection.where((row) => row.activityId.in(activityIds));
  }
  if (filters?.activityId) {
    collection = collection.where({ activityId: filters.activityId });
  }
  if (memberIds) {
    collection = collection.where((row) => row.memberId.in(memberIds));
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
