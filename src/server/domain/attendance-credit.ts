import "server-only";

import type { AttendanceStatus, Prisma as PrismaNS } from "@prisma/client";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import {
  createActivityPoints,
  findUnreversedActivityTransaction,
  reverseTransaction,
} from "@/server/domain/points";

type TransactionClient = PrismaNS.TransactionClient;

export type AttendanceCreditActivity = {
  id: string;
  seasonId: string;
  name: string;
  individualPoints: number;
};

function isAllowedAttendanceTransition(from: AttendanceStatus, to: AttendanceStatus): boolean {
  switch (from) {
    case "PENDING":
      switch (to) {
        case "PENDING":
        case "APPROVED":
        case "REJECTED":
        case "CANCELLED":
          return true;
        default: {
          const _exhaustive: never = to;
          return _exhaustive;
        }
      }
    case "APPROVED":
      switch (to) {
        case "APPROVED":
        case "REJECTED":
        case "CANCELLED":
          return true;
        case "PENDING":
          return false;
        default: {
          const _exhaustive: never = to;
          return _exhaustive;
        }
      }
    case "REJECTED":
      switch (to) {
        case "REJECTED":
          return true;
        case "PENDING":
        case "APPROVED":
        case "CANCELLED":
          return false;
        default: {
          const _exhaustive: never = to;
          return _exhaustive;
        }
      }
    case "CANCELLED":
      switch (to) {
        case "CANCELLED":
          return true;
        case "PENDING":
        case "APPROVED":
        case "REJECTED":
          return false;
        default: {
          const _exhaustive: never = to;
          return _exhaustive;
        }
      }
    default: {
      const _exhaustive: never = from;
      return _exhaustive;
    }
  }
}

export function assertAttendanceTransition(from: AttendanceStatus, to: AttendanceStatus) {
  if (isAllowedAttendanceTransition(from, to)) return;
  throw new DomainError(
    ErrorCodes.CONFLICT,
    "Una asistencia rechazada o anulada no se puede volver a aprobar. Usa un ajuste manual.",
    409
  );
}

export async function syncAttendanceCredit(
  tx: TransactionClient,
  input: {
    attendanceId: string;
    memberId: string;
    activity: AttendanceCreditActivity;
    status: AttendanceStatus;
    createdById?: string | null;
    reversalReason?: string;
  }
) {
  if (input.status === "APPROVED") {
    await createActivityPoints(tx, {
      memberId: input.memberId,
      seasonId: input.activity.seasonId,
      activityId: input.activity.id,
      attendanceId: input.attendanceId,
      points: input.activity.individualPoints,
      reason: `Asistencia: ${input.activity.name}`,
      createdById: input.createdById,
    });
    return;
  }

  const existing = await findUnreversedActivityTransaction(tx, input.attendanceId);
  if (!existing) return;

  await reverseTransaction(tx, {
    originalId: existing.id,
    createdById: input.createdById,
    reason: input.reversalReason ?? `Reversión de asistencia: ${input.activity.name}`,
  });
}
