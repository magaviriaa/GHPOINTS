import "server-only";

import type { CommitteeStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { slugify } from "@/lib/text";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";

export async function listCommittees() {
  return prisma.committee.findMany({
    include: {
      _count: {
        select: { memberships: { where: { isActive: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCommitteeDetail(idOrSlug: string) {
  return prisma.committee.findFirst({
    where: {
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      memberships: {
        where: { isActive: true },
        include: { member: true },
        orderBy: { member: { fullName: "asc" } },
      },
      scores: {
        include: { activity: true },
        orderBy: { activity: { startsAt: "desc" } },
        take: 20,
      },
    },
  });
}

export async function createCommittee(input: {
  actor: Actor;
  name: string;
  color?: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const name = input.name.trim();
  const committee = await prisma.committee.create({
    data: {
      name,
      slug: slugify(name),
      color: input.color || "#1e3a5f",
    },
  });
  await writeAuditLog({
    actorId: input.actor.id,
    action: "COMMITTEE_CREATED",
    entityType: "Committee",
    entityId: committee.id,
    after: { name: committee.name, slug: committee.slug },
    ip: input.ip,
  });
  return committee;
}

export async function updateCommittee(input: {
  actor: Actor;
  committeeId: string;
  name?: string;
  color?: string;
  status?: CommitteeStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.committee.findUnique({ where: { id: input.committeeId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }

  const committee = await prisma.committee.update({
    where: { id: input.committeeId },
    data: {
      name: input.name?.trim() ?? current.name,
      slug: input.name ? slugify(input.name) : current.slug,
      color: input.color ?? current.color,
      status: input.status ?? current.status,
    },
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "COMMITTEE_UPDATED",
    entityType: "Committee",
    entityId: committee.id,
    before: { name: current.name, status: current.status },
    after: { name: committee.name, status: committee.status },
    ip: input.ip,
  });
  return committee;
}
