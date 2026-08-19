export type HallOfFamePerson = {
  fullName: string;
  total: number;
  rank: number;
};

export type HallOfFameCommittee = {
  name: string;
  slug: string;
  total: number;
  rank: number;
};

export type HallOfFameStats = {
  activeMembers: number;
  newMembers: number;
  activities: number;
  attendances: number;
  pointsAwarded: number;
};

export type HallOfFameSnapshot = {
  activeWinner: HallOfFamePerson | null;
  newWinner: HallOfFamePerson | null;
  committeeWinner: HallOfFameCommittee | null;
  top3Active: HallOfFamePerson[];
  top3New: HallOfFamePerson[];
  top3Committees: HallOfFameCommittee[];
  stats: HallOfFameStats;
};

export function personFromRanking(entry: {
  fullName: string;
  total: number;
  rank: number;
}): HallOfFamePerson {
  return { fullName: entry.fullName, total: entry.total, rank: entry.rank };
}

export function committeeFromRanking(entry: {
  name: string;
  slug: string;
  total: number;
  rank: number;
}): HallOfFameCommittee {
  return { name: entry.name, slug: entry.slug, total: entry.total, rank: entry.rank };
}
