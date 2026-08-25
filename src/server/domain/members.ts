import "server-only";

import { and, or } from "@prisma/orm-postgres/orm-client";
import type { MemberStatus, MemberType } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { isoNow } from "@/server/db/time";
import { getAllowedEmailDomains } from "@/server/config/env";
import { isAllowedEmailDomain, normalizeEmail } from "@/server/auth/email";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { destroyMemberSessions } from "@/server/auth/session";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { getActiveSeason } from "@/server/domain/season";
import { refreshBadges } from "@/server/domain/badges";
import {
  assertCommitteeSelection,
  participatesInCompetition,
  shouldRevokeSessions,
} from "@/server/domain/members-pure";

export async function listMembers(filters: {
  query?: string;
  memberType?: MemberType | "all";
  status?: MemberStatus | "all";
  committeeId?: string | "all";
}) {
  const query = filters.query?.trim();
  let collection = db.orm.public.Member.orderBy((member) => member.fullName.asc());

  if (filters.memberType && filters.memberType !== "all") {
    collection = collection.where({ memberType: filters.memberType });
  }
  if (filters.status && filters.status !== "all") {
    collection = collection.where({ status: filters.status });
  }
  if (filters.committeeId && filters.committeeId !== "all") {
    const committeeId = filters.committeeId;
    collection = collection.where((member) =>
      member.committees.some((membership) =>
        and(membership.committeeId.eq(committeeId), membership.isActive.eq(true))
      )
    );
  }
  if (query) {
    const pattern = `%${query}%`;
    collection = collection.where((member) =>
      or(member.fullName.ilike(pattern), member.institutionalEmail.ilike(pattern))
    );
  }

  return collection
    .include("committees", (committees) =>
      committees
        .where({ isActive: true })
        .select("id", "committeeId", "isActive")
        .include("committee", (committee) => committee.select("id", "name", "slug", "color"))
    )
    .include("roles", (roles) => roles.select("role", "committeeId"))
    .all();
}

export async function listActiveMemberships(memberId: string) {
  return db.orm.public.MemberCommittee.where({ memberId, isActive: true })
    .select("id", "committeeId", "isActive", "joinedAt", "leftAt")
    .include("committee", (committee) => committee.select("id", "name", "slug", "color"))
    .orderBy((membership) => membership.joinedAt.asc())
    .all();
}

export async function listMemberMemberships(memberId: string) {
  return db.orm.public.MemberCommittee.where({ memberId })
    .select("id", "committeeId", "isActive", "joinedAt", "leftAt")
    .include("committee", (committee) => committee.select("id", "name", "slug", "color"))
    .orderBy((membership) => membership.joinedAt.desc())
    .all();
}

export async function listMemberBadges(memberId: string) {
  return db.orm.public.MemberBadge.where({ memberId })
    .select("id", "awardedAt", "periodKey")
    .include("badge", (badge) => badge.select("id", "name", "description", "slug"))
    .all();
}

export async function getMemberDetail(id: string) {
  return db.orm.public.Member.where({ id })
    .include("committees", (committees) =>
      committees
        .select("id", "committeeId", "isActive", "joinedAt", "leftAt")
        .include("committee", (committee) => committee.select("id", "name", "slug", "color"))
        .orderBy((membership) => membership.joinedAt.desc())
    )
    .include("roles", (roles) =>
      roles
        .select("id", "role", "committeeId")
        .include("committee", (committee) => committee.select("id", "name"))
    )
    .include("attendances", (attendances) =>
      attendances
        .select("id", "status", "registeredAt", "source")
        .include("activity", (activity) => activity.select("id", "name"))
        .orderBy((row) => row.registeredAt.desc())
        .limit(50)
    )
    .include("pointTransactions", (transactions) =>
      transactions
        .select("id", "points", "type", "reason", "createdAt")
        .include("activity", (activity) => activity.select("name"))
        .include("season", (season) => season.select("name"))
        .orderBy((row) => row.createdAt.desc())
        .limit(50)
    )
    .first();
}

export async function createMember(input: {
  actor: Actor;
  fullName: string;
  institutionalEmail: string;
  memberType: MemberType;
  committeeIds: string[];
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const email = normalizeEmail(input.institutionalEmail);
  if (!isAllowedEmailDomain(email, getAllowedEmailDomains())) {
    throw new DomainError(
      ErrorCodes.INVALID_EMAIL_DOMAIN,
      "El correo debe ser institucional.",
      400
    );
  }

  const committeeIds = assertCommitteeSelection(input.committeeIds, true);

  const member = await db.orm.public.Member.create({
    fullName: input.fullName.trim(),
    institutionalEmail: email,
    memberType: input.memberType,
    roles: (roles) => roles.create({ role: "MEMBER" }),
    committees: (committees) =>
      committees.create(committeeIds.map((committeeId) => ({ committeeId }))),
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBER_CREATED",
    entityType: "Member",
    entityId: member.id,
    after: { fullName: member.fullName, email, memberType: member.memberType },
    ip: input.ip,
  });
  return member;
}

export async function updateMember(input: {
  actor: Actor;
  memberId: string;
  fullName?: string;
  institutionalEmail?: string;
  memberType?: MemberType;
  status?: MemberStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await db.orm.public.Member.first({ id: input.memberId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  let email = current.institutionalEmail;
  if (input.institutionalEmail) {
    email = normalizeEmail(input.institutionalEmail);
    if (!isAllowedEmailDomain(email, getAllowedEmailDomains())) {
      throw new DomainError(
        ErrorCodes.INVALID_EMAIL_DOMAIN,
        "El correo debe ser institucional.",
        400
      );
    }
  }

  const member = await db.transaction(async (tx) => {
    const updated = await tx.orm.public.Member.where({ id: input.memberId }).update({
      fullName: input.fullName?.trim() ?? current.fullName,
      institutionalEmail: email,
      memberType: input.memberType ?? current.memberType,
      status: input.status ?? current.status,
    });
    if (!updated) {
      throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
    }

    if (email !== current.institutionalEmail) {
      await tx.orm.public.IdentityAccount.where({
        memberId: updated.id,
        provider: "EMAIL_OTP",
      }).updateAll({ providerUserId: email });
    }

    return updated;
  });

  if (shouldRevokeSessions(member.status)) {
    await destroyMemberSessions(member.id);
  }

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBER_UPDATED",
    entityType: "Member",
    entityId: member.id,
    before: {
      fullName: current.fullName,
      email: current.institutionalEmail,
      memberType: current.memberType,
      status: current.status,
    },
    after: {
      fullName: member.fullName,
      email: member.institutionalEmail,
      memberType: member.memberType,
      status: member.status,
    },
    ip: input.ip,
  });
  return member;
}

export async function setMemberCommittees(input: {
  actor: Actor;
  memberId: string;
  committeeIds: string[];
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const member = await db.orm.public.Member.where({ id: input.memberId })
    .include("committees", (committees) => committees.select("id", "committeeId", "isActive"))
    .first();
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const committeeIds = assertCommitteeSelection(
    input.committeeIds,
    participatesInCompetition(member.status)
  );
  const desired = new Set(committeeIds);
  const now = isoNow();

  await db.transaction(async (tx) => {
    for (const membership of member.committees.filter((row) => row.isActive)) {
      if (!desired.has(membership.committeeId)) {
        await tx.orm.public.MemberCommittee.where({ id: membership.id }).update({
          isActive: false,
          leftAt: now,
        });
      }
    }

    for (const committeeId of desired) {
      const active = member.committees.find(
        (row) => row.committeeId === committeeId && row.isActive
      );
      if (active) continue;
      await tx.orm.public.MemberCommittee.create({
        memberId: member.id,
        committeeId,
        joinedAt: now,
        isActive: true,
      });
    }
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBER_COMMITTEES_UPDATED",
    entityType: "Member",
    entityId: member.id,
    before: { committeeIds: member.committees.filter((row) => row.isActive).map((row) => row.committeeId) },
    after: { committeeIds },
    ip: input.ip,
  });
}

export async function setMemberAdmin(input: {
  actor: Actor;
  memberId: string;
  isAdmin: boolean;
  ip?: string | null;
}) {
  await setMemberRoles({
    actor: input.actor,
    memberId: input.memberId,
    isAdmin: input.isAdmin,
    ip: input.ip,
  });
}

export async function setMemberRoles(input: {
  actor: Actor;
  memberId: string;
  isAdmin?: boolean;
  leaderCommitteeIds?: string[];
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const member = await db.orm.public.Member.where({ id: input.memberId })
    .include("roles", (roles) => roles.select("id", "role", "committeeId"))
    .first();
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const currentlyAdmin = member.roles.some((role) => role.role === "ADMIN");
  const nextAdmin = input.isAdmin ?? currentlyAdmin;

  if (currentlyAdmin && !nextAdmin) {
    const { otherAdmins } = await db.orm.public.MemberRole.where({ role: "ADMIN" })
      .where((role) => role.memberId.neq(member.id))
      .aggregate((aggregate) => ({ otherAdmins: aggregate.count() }));
    if (otherAdmins === 0) {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Debe quedar al menos un administrador (GH General).",
        409
      );
    }
  }

  const currentLeaderIds: string[] = member.roles.flatMap((role) =>
    role.role === "COMMITTEE_LEADER" && role.committeeId ? [role.committeeId] : []
  );
  const nextLeaderIds: string[] = input.leaderCommitteeIds ?? currentLeaderIds;
  const desiredLeaders = new Set(nextLeaderIds);

  await db.transaction(async (tx) => {
    const hasMember = member.roles.some((role) => role.role === "MEMBER" && role.committeeId === null);
    if (!hasMember) {
      await tx.orm.public.MemberRole.create({
        memberId: member.id,
        role: "MEMBER",
        committeeId: null,
      });
    }

    if (nextAdmin && !currentlyAdmin) {
      await tx.orm.public.MemberRole.create({
        memberId: member.id,
        role: "ADMIN",
        committeeId: null,
      });
    }
    if (!nextAdmin && currentlyAdmin) {
      await tx.orm.public.MemberRole.where({ memberId: member.id, role: "ADMIN" }).deleteAndCount();
    }

    for (const role of member.roles.filter((row) => row.role === "COMMITTEE_LEADER")) {
      if (!role.committeeId || desiredLeaders.has(role.committeeId)) continue;
      await tx.orm.public.MemberRole.where({ id: role.id }).delete();
    }

    for (const committeeId of desiredLeaders) {
      const exists = member.roles.some(
        (row) => row.role === "COMMITTEE_LEADER" && row.committeeId === committeeId
      );
      if (exists) continue;
      await tx.orm.public.MemberRole.create({
        memberId: member.id,
        role: "COMMITTEE_LEADER",
        committeeId,
      });
    }
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBER_ROLE_UPDATED",
    entityType: "Member",
    entityId: member.id,
    after: { admin: nextAdmin, leaderCommitteeIds: nextLeaderIds },
    ip: input.ip,
  });

  const season = await getActiveSeason();
  if (season) {
    await refreshBadges({ seasonId: season.id, memberId: member.id });
  }
}
