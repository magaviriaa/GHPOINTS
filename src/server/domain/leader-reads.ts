import "server-only";

import { db } from "@/server/db/prisma";
import { fromDecimal, toDate } from "@/server/db/time";
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
  let collection = db.orm.public.Committee.include("memberships", (memberships) =>
    memberships
      .where({ isActive: true })
      .where((row) => row.member.some((member) => member.status.neq("INACTIVE")))
      .count()
  ).orderBy((committee) => committee.name.asc());

  if (isAdmin(actor)) {
    collection = collection.where({ status: "ACTIVE" });
  } else if (ledIds.length === 0) {
    return [];
  } else {
    collection = collection.where((committee) => committee.id.in(ledIds));
  }

  const rows = await collection.all();
  return rows.map((committee) => ({
    ...committee,
    _count: { memberships: committee.memberships },
  }));
}

export async function getCommitteeLeaderView(actor: Actor, slug: string) {
  const committee = await db.orm.public.Committee.where({ slug }).first();
  if (!committee) {
    throw new DomainError(ErrorCodes.NOT_FOUND, "No encontramos ese comité.", 404);
  }

  requireCommitteeViewer(actor, committee.id);

  const [season, memberships, scoreRows] = await Promise.all([
    getActiveSeason(),
    db.orm.public.MemberCommittee.where({ committeeId: committee.id, isActive: true })
      .include("member", (member) => member.select("fullName", "memberType", "status"))
      .all(),
    db.orm.public.CommitteeActivityScore.where({ committeeId: committee.id })
      .include("activity", (activity) => activity.select("name", "status", "startsAt"))
      .all(),
  ]);
  const ranking = await getCommitteeRanking(season?.id);
  const standing = ranking.entries.find((entry) => entry.committeeId === committee.id);

  const roster = memberships
    .filter((membership) => membership.member.status !== "INACTIVE")
    .sort((left, right) => left.member.fullName.localeCompare(right.member.fullName, "es"))
    .map((membership) => ({
      fullName: membership.member.fullName,
      memberType: membership.member.memberType,
      status: membership.member.status,
      joinedAt: toDate(membership.joinedAt),
    }));

  const scores = scoreRows
    .filter(
      (score) => score.activity.status === "CLOSED" || score.activity.status === "PROCESSED"
    )
    .sort(
      (left, right) =>
        toDate(right.activity.startsAt).getTime() - toDate(left.activity.startsAt).getTime()
    )
    .slice(0, 20)
    .map((score) => ({
      activityName: score.activity.name,
      participationRate: fromDecimal(score.participationRate),
      attendeeCredit: fromDecimal(score.attendeeCredit),
      eligibleMemberCount: score.eligibleMemberCount,
    }));

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
    roster,
    scores,
  };
}
