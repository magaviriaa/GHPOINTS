import "server-only";

import {
  getNextOpenActivity,
  getOpenActivities,
  listPublishedActivities,
} from "@/server/domain/activities";
import { listActiveMemberships, listMemberBadges } from "@/server/domain/members";
import { listMemberPointHistory, sumMemberPoints } from "@/server/domain/points";
import {
  getMemberCommitteeStandings,
  getMemberSeasonStanding,
} from "@/server/domain/ranking";
import { getActiveSeason } from "@/server/domain/season";
import { levelForPoints } from "@/server/domain/levels-pure";

export async function getMemberHome(memberId: string) {
  const season = await getActiveSeason();
  const [standing, committeeStandings, recent, nextActivity, memberships, points] =
    await Promise.all([
      getMemberSeasonStanding(memberId, season?.id),
      getMemberCommitteeStandings(memberId, season?.id),
      listMemberPointHistory(memberId, { seasonId: season?.id, take: 5 }),
      getNextOpenActivity(),
      listActiveMemberships(memberId),
      season ? sumMemberPoints(memberId, season.id) : Promise.resolve(0),
    ]);

  return {
    season,
    standing,
    committeeStandings,
    recent,
    nextActivity,
    memberships,
    points,
    level: levelForPoints(points),
  };
}

export async function getMemberProfile(memberId: string) {
  const season = await getActiveSeason();
  const [memberships, history, badges, points] = await Promise.all([
    listActiveMemberships(memberId),
    listMemberPointHistory(memberId, { seasonId: season?.id }),
    listMemberBadges(memberId),
    season ? sumMemberPoints(memberId, season.id) : Promise.resolve(0),
  ]);

  return { season, memberships, history, badges, points, level: levelForPoints(points) };
}

export async function getMemberActivities() {
  const season = await getActiveSeason();
  const [open, seasonActivities] = await Promise.all([
    getOpenActivities(),
    listPublishedActivities(season?.id),
  ]);
  return { season, open, seasonActivities };
}
