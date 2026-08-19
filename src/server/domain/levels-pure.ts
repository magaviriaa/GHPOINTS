export type Level = {
  minPoints: number;
  slug: string;
  name: string;
};

export type LevelProgress = {
  current: Level;
  next: Level | null;
  progress: number;
};

export const GH_POINT_LEVELS: readonly Level[] = [
  { minPoints: 0, slug: "novato", name: "Novato" },
  { minPoints: 100, slug: "bronce", name: "Bronce" },
  { minPoints: 250, slug: "plata", name: "Plata" },
  { minPoints: 500, slug: "oro", name: "Oro" },
  { minPoints: 1000, slug: "elite", name: "Élite" },
];

export function levelForPoints(points: number): LevelProgress {
  const safe = Number.isFinite(points) ? Math.max(0, points) : 0;
  let current = GH_POINT_LEVELS[0]!;
  for (const level of GH_POINT_LEVELS) {
    if (safe >= level.minPoints) current = level;
  }
  const currentIndex = GH_POINT_LEVELS.findIndex((level) => level.slug === current.slug);
  const next = GH_POINT_LEVELS[currentIndex + 1] ?? null;
  if (!next) {
    return { current, next: null, progress: 1 };
  }
  const span = next.minPoints - current.minPoints;
  const progress = span <= 0 ? 1 : Math.min(1, (safe - current.minPoints) / span);
  return { current, next, progress };
}
