export function isEntraTidAllowed(
  tid: string,
  tenantId: string,
  allowedTids: string[]
): boolean {
  const normalizedTid = tid.trim().toLowerCase();
  const normalizedTenant = tenantId.trim().toLowerCase();
  if (allowedTids.length > 0) {
    return allowedTids.some((allowed) => allowed === normalizedTid);
  }
  if (normalizedTenant === "organizations" || normalizedTenant === "common") {
    return false;
  }
  return normalizedTid.length > 0 && normalizedTid === normalizedTenant;
}

export function entraAllowedIssuers(tenantId: string, allowedTids: string[]): string[] {
  const normalizedAllowed = allowedTids.map((tid) => tid.trim().toLowerCase()).filter(Boolean);
  const normalizedTenant = tenantId.trim().toLowerCase();
  const tids = normalizedAllowed.length > 0 ? normalizedAllowed : [normalizedTenant];
  return tids
    .filter((tid) => tid !== "common" && tid !== "organizations")
    .map((tid) => `https://login.microsoftonline.com/${tid}/v2.0`);
}

export function entraEmailFromClaims(claims: {
  email?: string;
  preferred_username?: string;
  upn?: string;
}): string | null {
  const candidates = [claims.email, claims.preferred_username, claims.upn];
  for (const candidate of candidates) {
    if (candidate && candidate.includes("@")) return candidate.trim().toLowerCase();
  }
  return null;
}
