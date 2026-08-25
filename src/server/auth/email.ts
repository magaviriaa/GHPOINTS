export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailAddress(email: string): boolean {
  const normalized = normalizeEmail(email);
  const firstAt = normalized.indexOf("@");
  return (
    firstAt > 0 &&
    firstAt === normalized.lastIndexOf("@") &&
    firstAt < normalized.length - 1 &&
    !/\s/.test(normalized)
  );
}

export function emailDomain(email: string): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return "";
  return normalized.slice(at + 1);
}

export function isAllowedEmailDomain(email: string, allowedDomains: string[]): boolean {
  const domain = emailDomain(email);
  return allowedDomains.some((allowed) => allowed === domain);
}
