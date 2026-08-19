import "server-only";

import type { MemberStatus, MemberType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { getAllowedEmailDomains } from "@/server/config/env";
import { isAllowedEmailDomain, normalizeEmail } from "@/server/auth/email";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { destroyMemberSessions } from "@/server/auth/session";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import { getActiveSeason } from "@/server/domain/season";
import { refreshBadges } from "@/server/domain/badges";

export async function listMembers(filters: {
  query?: string;
  memberType?: MemberType | "all";
  status?: MemberStatus | "all";
  committeeId?: string | "all";
}) {
  const query = filters.query?.trim();
  const where: Prisma.MemberWhereInput = {
    memberType:
      filters.memberType && filters.memberType !== "all" ? filters.memberType : undefined,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    committees:
      filters.committeeId && filters.committeeId !== "all"
        ? { some: { committeeId: filters.committeeId, isActive: true } }
        : undefined,
    OR: query
      ? [
          { fullName: { contains: query, mode: "insensitive" } },
          { institutionalEmail: { contains: query, mode: "insensitive" } },
        ]
      : undefined,
  };

  return prisma.member.findMany({
    where,
    include: {
      committees: {
        where: { isActive: true },
        include: { committee: true },
      },
      roles: true,
    },
    orderBy: { fullName: "asc" },
  });
}

export async function listActiveMemberships(memberId: string) {
  return prisma.memberCommittee.findMany({
    where: { memberId, isActive: true },
    include: { committee: true },
  });
}

export async function listMemberBadges(memberId: string) {
  return prisma.memberBadge.findMany({
    where: { memberId },
    include: { badge: true },
  });
}

export async function getMemberDetail(id: string) {
  return prisma.member.findUnique({
    where: { id },
    include: {
      committees: {
        include: { committee: true },
        orderBy: { joinedAt: "desc" },
      },
      roles: { include: { committee: true } },
      attendances: {
        include: { activity: true },
        orderBy: { registeredAt: "desc" },
        take: 50,
      },
      pointTransactions: {
        include: { activity: true, season: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
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

  const member = await prisma.member.create({
    data: {
      fullName: input.fullName.trim(),
      institutionalEmail: email,
      memberType: input.memberType,
      roles: { create: { role: "MEMBER" } },
      committees: {
        create: input.committeeIds.map((committeeId) => ({ committeeId })),
      },
    },
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
  const current = await prisma.member.findUnique({ where: { id: input.memberId } });
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

  const member = await prisma.$transaction(async (tx) => {
    const updated = await tx.member.update({
      where: { id: input.memberId },
      data: {
        fullName: input.fullName?.trim() ?? current.fullName,
        institutionalEmail: email,
        memberType: input.memberType ?? current.memberType,
        status: input.status ?? current.status,
      },
    });

    if (email !== current.institutionalEmail) {
      await tx.identityAccount.updateMany({
        where: { memberId: updated.id, provider: "EMAIL_OTP" },
        data: { providerUserId: email },
      });
    }

    return updated;
  });

  if (member.status === "INACTIVE") {
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
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    include: { committees: true },
  });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const desired = new Set(input.committeeIds);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const membership of member.committees.filter((row) => row.isActive)) {
      if (!desired.has(membership.committeeId)) {
        await tx.memberCommittee.update({
          where: { id: membership.id },
          data: { isActive: false, leftAt: now },
        });
      }
    }

    for (const committeeId of desired) {
      const active = member.committees.find(
        (row) => row.committeeId === committeeId && row.isActive
      );
      if (active) continue;
      await tx.memberCommittee.create({
        data: { memberId: member.id, committeeId, joinedAt: now, isActive: true },
      });
    }
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBER_COMMITTEES_UPDATED",
    entityType: "Member",
    entityId: member.id,
    before: { committeeIds: member.committees.filter((row) => row.isActive).map((row) => row.committeeId) },
    after: { committeeIds: input.committeeIds },
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
  const member = await prisma.member.findUnique({
    where: { id: input.memberId },
    include: { roles: true },
  });
  if (!member) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese integrante.", 404);
  }

  const currentlyAdmin = member.roles.some((role) => role.role === "ADMIN");
  const nextAdmin = input.isAdmin ?? currentlyAdmin;

  if (currentlyAdmin && !nextAdmin) {
    const otherAdmins = await prisma.memberRole.count({
      where: { role: "ADMIN", memberId: { not: member.id } },
    });
    if (otherAdmins === 0) {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Debe quedar al menos un administrador (GH General).",
        409
      );
    }
  }

  const currentLeaderIds = member.roles.flatMap((role) =>
    role.role === "COMMITTEE_LEADER" && role.committeeId ? [role.committeeId] : []
  );
  const nextLeaderIds = input.leaderCommitteeIds ?? currentLeaderIds;
  const desiredLeaders = new Set(nextLeaderIds);

  await prisma.$transaction(async (tx) => {
    const hasMember = member.roles.some((role) => role.role === "MEMBER" && role.committeeId === null);
    if (!hasMember) {
      await tx.memberRole.create({ data: { memberId: member.id, role: "MEMBER" } });
    }

    if (nextAdmin && !currentlyAdmin) {
      await tx.memberRole.create({ data: { memberId: member.id, role: "ADMIN" } });
    }
    if (!nextAdmin && currentlyAdmin) {
      await tx.memberRole.deleteMany({ where: { memberId: member.id, role: "ADMIN" } });
    }

    for (const role of member.roles.filter((row) => row.role === "COMMITTEE_LEADER")) {
      if (!role.committeeId || desiredLeaders.has(role.committeeId)) continue;
      await tx.memberRole.delete({ where: { id: role.id } });
    }

    for (const committeeId of desiredLeaders) {
      const exists = member.roles.some(
        (row) => row.role === "COMMITTEE_LEADER" && row.committeeId === committeeId
      );
      if (exists) continue;
      await tx.memberRole.create({
        data: { memberId: member.id, role: "COMMITTEE_LEADER", committeeId },
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
