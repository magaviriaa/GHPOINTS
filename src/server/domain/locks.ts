import "server-only";

import type { Tx } from "@/server/db/prisma";
import { DomainError, ErrorCodes } from "@/server/domain/errors";

/**
 * Prisma's ORM surface does not expose SELECT ... FOR UPDATE. A conditional
 * no-op UPDATE provides the same serialization point on Postgres: concurrent
 * writers wait on this row and Postgres re-checks the predicate after waiting.
 */
export async function lockActivityRow(tx: Tx, activityId: string) {
  const current = await tx.orm.public.Activity.first({ id: activityId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa actividad.", 404);
  }

  const locked = await tx.orm.public.Activity.where({
    id: current.id,
    status: current.status,
  }).update({ status: current.status });
  if (!locked) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "La actividad cambió mientras la estabas actualizando. Recarga e inténtalo de nuevo.",
      409
    );
  }
  return locked;
}

export async function lockSeasonRow(tx: Tx, seasonId: string) {
  const current = await tx.orm.public.Season.first({ id: seasonId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa temporada.", 404);
  }

  const locked = await tx.orm.public.Season.where({
    id: current.id,
    status: current.status,
  }).update({ status: current.status });
  if (!locked) {
    throw new DomainError(
      ErrorCodes.CONFLICT,
      "La temporada cambió mientras se procesaba la operación. Inténtalo de nuevo.",
      409
    );
  }
  return locked;
}
