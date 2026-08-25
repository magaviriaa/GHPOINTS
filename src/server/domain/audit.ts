import "server-only";

import { or } from "@prisma/orm-postgres/orm-client";
import { db } from "@/server/db/prisma";
import type { JsonValue } from "@/server/db/types";

type WriteAuditInput = {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: JsonValue | null;
  after?: JsonValue | null;
  ip?: string | null;
};

export async function writeAuditLog(input: WriteAuditInput) {
  await db.orm.public.AuditLog.create({
    actorId: input.actorId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
  });
}

export async function listAuditLogs(params: {
  query?: string;
  take?: number;
  skip?: number;
}) {
  const take = params.take ?? 50;
  const skip = params.skip ?? 0;
  const query = params.query?.trim();
  const pattern = query ? `%${query}%` : null;

  let collection = db.orm.public.AuditLog.include("actor", (actor) =>
    actor.select("id", "fullName")
  ).orderBy((row) => row.createdAt.desc());

  if (pattern) {
    collection = collection.where((row) =>
      or(
        row.action.ilike(pattern),
        row.entityType.ilike(pattern),
        row.entityId.ilike(pattern)
      )
    );
  }

  return collection.offset(skip).limit(take).all();
}
