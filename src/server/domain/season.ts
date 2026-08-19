import "server-only";

import type { SeasonStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
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

export async function getActiveSeason() {
  return prisma.season.findFirst({
    where: { status: "ACTIVE" },
  });
}

export async function resolveSeason(seasonId?: string) {
  if (seasonId) {
    return prisma.season.findUnique({ where: { id: seasonId } });
  }
  return getActiveSeason();
}

export async function listSeasons() {
  return prisma.season.findMany({
    orderBy: { startDate: "desc" },
  });
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
  try {
    const season = await prisma.season.create({
      data: {
        name: input.name.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status ?? "UPCOMING",
      },
    });
    await writeAuditLog({
      actorId: input.actor.id,
      action: "SEASON_CREATED",
      entityType: "Season",
      entityId: season.id,
      after: { name: season.name, status: season.status },
      ip: input.ip,
    });
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

export async function updateSeasonStatus(input: {
  actor: Actor;
  seasonId: string;
  status: SeasonStatus;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  const current = await prisma.season.findUnique({ where: { id: input.seasonId } });
  if (!current) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos esa temporada.", 404);
  }

  try {
    const snapshot =
      input.status === "CLOSED" ? await buildHallOfFameSnapshot(current.id) : null;

    const season = await prisma.$transaction(async (tx) => {
      const updated = await tx.season.update({
        where: { id: input.seasonId },
        data: { status: input.status },
      });
      if (snapshot) {
        await persistHallOfFameSnapshot(tx, updated.id, snapshot);
      }
      return updated;
    });

    await writeAuditLog({
      actorId: input.actor.id,
      action: input.status === "CLOSED" ? "SEASON_CLOSED" : "SEASON_UPDATED",
      entityType: "Season",
      entityId: season.id,
      before: { status: current.status },
      after: { status: season.status },
      ip: input.ip,
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
