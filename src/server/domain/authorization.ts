import type { MemberStatus, MemberType, RoleCode } from "@prisma/client";
import { DomainError, ErrorCodes } from "@/server/domain/errors";

export type ActorRole = {
  role: RoleCode;
  committeeId: string | null;
};

export type Actor = {
  id: string;
  fullName: string;
  institutionalEmail: string;
  memberType: MemberType;
  status: MemberStatus;
  roles: ActorRole[];
  sessionId: string;
};

export function hasAdminRole(roles: ActorRole[]): boolean {
  return roles.some((role) => role.role === "ADMIN");
}

export function isAdmin(actor: Actor): boolean {
  return hasAdminRole(actor.roles);
}

export function ledCommitteeIds(actor: Actor): string[] {
  const ids: string[] = [];
  for (const role of actor.roles) {
    if (role.role !== "COMMITTEE_LEADER") continue;
    if (role.committeeId === null) continue;
    ids.push(role.committeeId);
  }
  return ids;
}

export function isCommitteeLeader(actor: Actor): boolean {
  return ledCommitteeIds(actor).length > 0;
}

export function canViewCommitteeRoster(actor: Actor, committeeId: string): boolean {
  return isAdmin(actor) || ledCommitteeIds(actor).includes(committeeId);
}

export function canOpenLeaderArea(actor: Actor): boolean {
  return isAdmin(actor) || isCommitteeLeader(actor);
}

export function requireCommitteeViewer(actor: Actor | null, committeeId: string): Actor {
  const current = requireActor(actor);
  if (!canViewCommitteeRoster(current, committeeId)) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "No tienes acceso al roster de este comité.",
      403
    );
  }
  return current;
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor || actor.status !== "ACTIVE") {
    throw new DomainError(
      ErrorCodes.UNAUTHORIZED,
      "Inicia sesión para continuar.",
      401
    );
  }
  return actor;
}

export function requireAdmin(actor: Actor | null): Actor {
  const current = requireActor(actor);
  if (!isAdmin(current)) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "No tienes permisos de administración.",
      403
    );
  }
  return current;
}

export function requireCommitteeLeader(actor: Actor | null, committeeId: string): Actor {
  const current = requireActor(actor);
  if (isAdmin(current)) return current;
  if (!ledCommitteeIds(current).includes(committeeId)) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "No lideras este comité.",
      403
    );
  }
  return current;
}

export function canProposeActivity(actor: Actor, committeeId: string): boolean {
  return isAdmin(actor) || ledCommitteeIds(actor).includes(committeeId);
}
