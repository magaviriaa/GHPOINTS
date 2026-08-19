const DEFAULT_PATH = "/app";

/**
 * Accepts only same-origin absolute paths. Rejects protocol-relative (`//host`)
 * and backslash (`/\host`) forms, which browsers resolve to an external origin.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = DEFAULT_PATH): string {
  const candidate = (value ?? "").trim();
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.startsWith("/\\")) return fallback;
  if (candidate.includes("\n") || candidate.includes("\r")) return fallback;
  return candidate;
}
