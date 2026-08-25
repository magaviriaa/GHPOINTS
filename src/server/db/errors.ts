const UNIQUE_VIOLATION = "23505";

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch-boundary type guard
export function isUniqueConstraint(error: unknown): boolean {
  if (!(error instanceof Object)) return false;
  if (!("sqlState" in error)) return false;
  return error.sqlState === UNIQUE_VIOLATION;
}
