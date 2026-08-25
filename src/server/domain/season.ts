import "server-only";

import type { SeasonStatus } from "@/server/db/types";
import { db } from "@/server/db/prisma";
import { toDateOnly } from "@/server/db/time";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { isUniqueConstraint } from "@/server/db/errors";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";
import {
  buildHallOfFameSnapshot,
  persistHallOfFameSnapshot,
} from "@/server/domain/hall-of-fame";
import { refreshBadges } from "@/server/domain/badges";
import { lockSeasonRow } from "@/server/domain/locks";

export async function getActiveSeason() {
  return db.orm.public.Season.where({ status: "ACTIVE" }).first();
}

export async function resolveSeason(seasonId?: string) {
  if (seasonId) {
    return db.orm.public.Season.first({ id: seasonId });
  }
  return getActiveSeason();
}

export async function listSeasons() {
  return db.orm.public.Season.orderBy((season) => season.startDate.desc()).all();
}

export async function createSeason(input: {
  actor: Actor;
  name: string;
  startDate: Date;
  endDate: Date;
  status?: SeasonStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const name = input.name.trim();
  const start = input.startDate.getTime();
  const end = input.endDate.getTime();
  if (!name || Number.isNaN(start) || Number.isNaN(end) || start > end) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Revisa el nombre y el rango de fechas de la temporada.",
      400
    );
  }
  if (input.status === "CLOSED") {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "Crea la temporada como próxima o en curso y ciérrala después para congelar su foto.",
      400
    );
  }
  try {
    return await db.transaction(async (tx) => {
      const season = await tx.orm.public.Season.create({
        name,
        startDate: toDateOnly(input.startDate),
        endDate: toDateOnly(input.endDate),
        status: input.status ?? "UPCOMING",
      });
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action: "SEASON_CREATED",
        entityType: "Season",
        entityId: season.id,
        after: { name: season.name, status: season.status },
        ip: input.ip,
      });
      return season;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Ya existe una temporada activa. Ciérrala antes de activar otra.",
        409
      );
    }
    throw error;
  }
}

export async function updateSeasonStatus(input: {
  actor: Actor;
  seasonId: string;
  status: SeasonStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await db.orm.public.Season.first({ id: input.seasonId });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa temporada.", 404);
  }
  if (current.status === input.status) return current;
  if (current.status === "CLOSED") {
    throw new DomainError(
      ErrorCodes.SEASON_CLOSED,
      "Una temporada cerrada no se puede reabrir porque su Hall of Fame ya quedó congelado.",
      409
    );
  }

  try {
    const season = await db.transaction(async (tx) => {
      const locked = await lockSeasonRow(tx, input.seasonId);
      if (locked.status === input.status) return locked;
      if (locked.status === "CLOSED") {
        throw new DomainError(
          ErrorCodes.SEASON_CLOSED,
          "Una temporada cerrada no se puede reabrir porque su Hall of Fame ya quedó congelado.",
          409
        );
      }
      const snapshot =
        input.status === "CLOSED" ? await buildHallOfFameSnapshot(tx, locked.id) : null;
      const updated = await tx.orm.public.Season.where({
        id: input.seasonId,
        status: locked.status,
      }).update({
        status: input.status,
      });
      if (!updated) {
        throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa temporada.", 404);
      }
      if (snapshot) {
        await persistHallOfFameSnapshot(tx, updated.id, snapshot);
      }
      await writeAuditLog(tx, {
        actorId: input.actor.id,
        action: input.status === "CLOSED" ? "SEASON_CLOSED" : "SEASON_UPDATED",
        entityType: "Season",
        entityId: updated.id,
        before: { status: locked.status },
        after: { status: updated.status },
        ip: input.ip,
      });
      return updated;
    });

    if (input.status === "CLOSED") {
      await refreshBadges({ seasonId: season.id });
    }

    return season;
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new DomainError(
        ErrorCodes.CONFLICT,
        "Ya existe una temporada activa. Ciérrala antes de activar otra.",
        409
      );
    }
    throw error;
  }
}

export function assertSeasonWritable(status: SeasonStatus) {
  if (status === "CLOSED") {
    throw new DomainError(
      ErrorCodes.SEASON_CLOSED,
      "Esta temporada ya está cerrada.",
      400
    );
  }
}
