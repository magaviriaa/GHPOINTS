import "server-only";

import { prisma } from "@/server/db/prisma";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { getCommitteeRanking } from "@/server/domain/ranking";
import { getActiveSeason } from "@/server/domain/season";
import {
  canOpenLeaderArea,
  isAdmin,
  ledCommitteeIds,
  requireCommitteeViewer,
  type Actor,
} from "@/server/domain/authorization";

export async function listLeaderCommittees(actor: Actor) {
  if (!canOpenLeaderArea(actor)) return [];

  const ledIds = ledCommitteeIds(actor);
  const where = isAdmin(actor)
    ? { status: "ACTIVE" as const }
    : { id: { in: ledIds } };

  return prisma.committee.findMany({
    where,
    include: {
      _count: {
        select: { memberships: { where: { isActive: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCommitteeLeaderView(actor: Actor, slug: string) {
  const committee = await prisma.committee.findFirst({
    where: { slug },
    include: {
      memberships: {
        where: { isActive: true },
        include: {
          member: {
            select: {
              fullName: true,
              memberType: true,
              status: true,
            },
          },
        },
        orderBy: { member: { fullName: "asc" } },
      },
      scores: {
        where: {
          activity: { status: { in: ["CLOSED", "PROCESSED"] } },
        },
        include: { activity: { select: { name: true, startsAt: true } } },
        orderBy: { activity: { startsAt: "desc" } },
        take: 20,
      },
    },
  });
  if (!committee) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }

  requireCommitteeViewer(actor, committee.id);

  const season = await getActiveSeason();
  const ranking = await getCommitteeRanking(season?.id);
  const standing = ranking.entries.find((entry) => entry.committeeId === committee.id);

  return {
    committee: {
      id: committee.id,
      name: committee.name,
      slug: committee.slug,
      color: committee.color,
      status: committee.status,
    },
    season,
    standing: standing
      ? { rank: standing.rank, total: standing.total, activities: standing.activities }
      : null,
    roster: committee.memberships.map((membership) => ({
      fullName: membership.member.fullName,
      memberType: membership.member.memberType,
      status: membership.member.status,
      joinedAt: membership.joinedAt,
    })),
    scores: committee.scores.map((score) => ({
      activityName: score.activity.name,
      participationRate: Number(score.participationRate),
      attendeeCredit: Number(score.attendeeCredit),
      eligibleMemberCount: score.eligibleMemberCount,
    })),
  };
}
