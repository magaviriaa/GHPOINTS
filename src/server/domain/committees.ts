import "server-only";

import { or } from "@prisma/orm-postgres/orm-client";
import type { CommitteeStatus } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { slugify } from "@/lib/text";
import { toDate } from "@/server/db/time";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";

export async function listCommittees() {
  const rows = await db.orm.public.Committee.include("memberships", (memberships) =>
    memberships.where({ isActive: true }).count()
  )
    .orderBy((committee) => committee.name.asc())
    .all();

  return rows.map((committee) => ({
    ...committee,
    _count: { memberships: committee.memberships },
  }));
}

export async function getCommitteeDetail(idOrSlug: string) {
  const committee = await db.orm.public.Committee.where((row) =>
    or(row.id.eq(idOrSlug), row.slug.eq(idOrSlug))
  )
    .include("memberships", (memberships) =>
      memberships
        .where({ isActive: true })
        .select("id", "joinedAt")
        .include("member", (member) => member.select("fullName"))
        .orderBy((membership) => membership.joinedAt.asc())
    )
    .include("scores", (scores) =>
      scores
        .select("id", "participationRate", "computedAt")
        .include("activity", (activity) => activity.select("name", "startsAt"))
        .orderBy((score) => score.computedAt.desc())
        .limit(20)
    )
    .first();

  if (!committee) return null;

  const memberships = [...committee.memberships].sort((left, right) =>
    left.member.fullName.localeCompare(right.member.fullName, "es")
  );
  const scores = [...committee.scores].sort(
    (left, right) => toDate(right.activity.startsAt).getTime() - toDate(left.activity.startsAt).getTime()
  );

  return { ...committee, memberships, scores };
}

export async function createCommittee(input: {
  actor: Actor;
  name: string;
  color?: string;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const name = input.name.trim();
  const committee = await db.orm.public.Committee.create({
    name,
    slug: slugify(name),
    color: input.color || "#1e3a5f",
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
  const current = await db.orm.public.Committee.first({ id: input.committeeId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }

  const committee = await db.orm.public.Committee.where({ id: input.committeeId }).update({
    name: input.name?.trim() ?? current.name,
    slug: input.name ? slugify(input.name) : current.slug,
    color: input.color ?? current.color,
    status: input.status ?? current.status,
  });
  if (!committee) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }

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
