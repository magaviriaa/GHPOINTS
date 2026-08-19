export class DomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
  }
}

export const ErrorCodes = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  INVALID_EMAIL_DOMAIN: "INVALID_EMAIL_DOMAIN",
  OTP_INVALID: "OTP_INVALID",
  OTP_EXPIRED: "OTP_EXPIRED",
  OTP_RATE_LIMITED: "OTP_RATE_LIMITED",
  ALREADY_REGISTERED: "ALREADY_REGISTERED",
  REGISTRATION_CLOSED: "REGISTRATION_CLOSED",
  ACTIVITY_NOT_OPEN: "ACTIVITY_NOT_OPEN",
  ACTIVITY_CANCELLED: "ACTIVITY_CANCELLED",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  SEASON_CLOSED: "SEASON_CLOSED",
  REASON_REQUIRED: "REASON_REQUIRED",
  ALREADY_REVERSED: "ALREADY_REVERSED",
  IMPORT_INVALID: "IMPORT_INVALID",
  CONFLICT: "CONFLICT",
} as const;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch-boundary type guard
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- catch-boundary mapper
export function toUserMessage(error: unknown): string {
  if (isDomainError(error)) return error.message;
  console.error(error);
  return "Ocurrió un error. Inténtalo de nuevo.";
}
