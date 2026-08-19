import { startOfMonthUtc, startOfWeekUtc, rangeForIsoWeek } from "@/lib/dates";

export type Rankable = {
  total: number;
};

export function competitionRanks(sortedTotalsDesc: number[]): number[] {
  const ranks: number[] = [];
  for (let i = 0; i < sortedTotalsDesc.length; i += 1) {
    const current = sortedTotalsDesc[i];
    const previous = sortedTotalsDesc[i - 1];
    const previousRank = ranks[i - 1];
    if (i > 0 && current === previous && previousRank !== undefined) {
      ranks.push(previousRank);
    } else {
      ranks.push(i + 1);
    }
  }
  return ranks;
}

export function withCompetitionRanks<T extends Rankable>(
  items: T[],
  compareTies?: (left: T, right: T) => number
): Array<T & { rank: number }> {
  const sorted = [...items].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return compareTies ? compareTies(left, right) : 0;
  });
  const ranks = competitionRanks(sorted.map((item) => item.total));
  return sorted.map((item, index) => ({ ...item, rank: ranks[index] ?? index + 1 }));
}

export type RankingPeriod = "season" | "week" | "month";

export function parseRankingPeriod(value: string | RankingPeriod | undefined): RankingPeriod {
  if (value === "week" || value === "month" || value === "season") return value;
  return "season";
}

export type PointWindow = { gte: Date; lt: Date | null };

/**
 * The `createdAt` window a ranking period covers. Shared by the board query and
 * the single-Integrante position query so both read the same slice of the Ledger.
 */
export function rankingWindow(
  period: RankingPeriod,
  options?: { isoWeek?: string; now?: Date }
): PointWindow | null {
  const now = options?.now ?? new Date();

  if (period === "week") {
    if (options?.isoWeek) {
      const range = rangeForIsoWeek(options.isoWeek);
      if (range) return { gte: range.start, lt: range.end };
    }
    return { gte: startOfWeekUtc(now), lt: null };
  }

  if (period === "month") {
    return { gte: startOfMonthUtc(now), lt: null };
  }

  return null;
}
