import type { MemberStatus } from "@/server/db/types";
import { MAX_MEMBER_COMMITTEES } from "@/lib/constants";
import { DomainError, ErrorCodes } from "@/server/domain/errors";

export function canAuthenticate(status: MemberStatus): boolean {
  switch (status) {
    case "ACTIVE":
    case "HONORARY":
      return true;
    case "ON_LEAVE":
    case "INACTIVE":
      return false;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function participatesInCompetition(status: MemberStatus): boolean {
  switch (status) {
    case "ACTIVE":
      return true;
    case "ON_LEAVE":
    case "HONORARY":
    case "INACTIVE":
      return false;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function shouldRevokeSessions(status: MemberStatus): boolean {
  return !canAuthenticate(status);
}

export function uniqueCommitteeIds(committeeIds: string[]): string[] {
  return [...new Set(committeeIds.filter((id) => id.length > 0))];
}

export function assertCommitteeSelection(
  committeeIds: string[],
  requireAtLeastOne: boolean
): string[] {
  const unique = uniqueCommitteeIds(committeeIds);
  if (unique.length > MAX_MEMBER_COMMITTEES) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `Como máximo ${MAX_MEMBER_COMMITTEES} comités a la vez. Al cambiar, el anterior queda en Perteneció a.`,
      400
    );
  }
  if (requireAtLeastOne && unique.length < 1) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      `Un integrante vigente pertenece a 1, 2 o ${MAX_MEMBER_COMMITTEES} comités.`,
      400
    );
  }
  return unique;
}

export type SplitMemberships<T> = {
  current: T[];
  past: T[];
};

function instantMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function splitMemberships<
  T extends { isActive: boolean; joinedAt: Date | string; leftAt: Date | string | null },
>(memberships: T[]): SplitMemberships<T> {
  const current = memberships
    .filter((row) => row.isActive)
    .sort((a, b) => instantMs(a.joinedAt) - instantMs(b.joinedAt));
  const past = memberships
    .filter((row) => !row.isActive)
    .sort((a, b) => {
      const aEnd = a.leftAt ?? a.joinedAt;
      const bEnd = b.leftAt ?? b.joinedAt;
      return instantMs(bEnd) - instantMs(aEnd);
    });
  return { current, past };
}
