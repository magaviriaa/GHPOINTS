import {
  POINTS_BADGE_THRESHOLD,
  STREAK_BADGE_THRESHOLD,
  TOP_BADGE_LIMIT,
} from "@/lib/constants";

export const BADGE_SLUGS = {
  STREAK: "streak",
  POINTS_500: "500-points",
  TOP_10: "top-10",
  MONTHLY_MVP: "monthly-mvp",
  LEADER: "committee-leader",
} as const;

export type BadgeSlug = (typeof BADGE_SLUGS)[keyof typeof BADGE_SLUGS];

export function consecutiveActivityStreak(
  activitiesNewestFirst: Array<{ id: string }>,
  attendedIds: Set<string>
): number {
  let streak = 0;
  for (const activity of activitiesNewestFirst) {
    if (!attendedIds.has(activity.id)) break;
    streak += 1;
  }
  return streak;
}

export function earnsStreakBadge(streak: number): boolean {
  return streak >= STREAK_BADGE_THRESHOLD;
}

export function earnsPointsBadge(points: number): boolean {
  return points >= POINTS_BADGE_THRESHOLD;
}

export function earnsTopBadge(rank: number | null): boolean {
  return rank !== null && rank >= 1 && rank <= TOP_BADGE_LIMIT;
}

export function monthlyMvpMemberIds(
  entries: Array<{ memberId: string; total: number }>
): string[] {
  let best = 0;
  for (const entry of entries) {
    if (entry.total > best) best = entry.total;
  }
  if (best <= 0) return [];
  return entries.filter((entry) => entry.total === best).map((entry) => entry.memberId);
}
