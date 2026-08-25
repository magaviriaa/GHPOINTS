export type MemberType = "NEW" | "ACTIVE";

export type MemberStatus = "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE";

export type RoleCode = "MEMBER" | "COMMITTEE_LEADER" | "ADMIN";

export type CommitteeStatus = "ACTIVE" | "INACTIVE";

export type SeasonStatus = "UPCOMING" | "ACTIVE" | "CLOSED";

export type ActivityStatus = "DRAFT" | "OPEN" | "CLOSED" | "PROCESSED" | "CANCELLED";

export type ActivityType = "GENERAL" | "SPORTS" | "TALK" | "WORKSHOP" | "SOCIAL" | "OTHER";

export type AttendanceMode = "OPEN_LINK";

export type ApprovalMode = "AUTO" | "MANUAL";

export type AttendanceStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AttendanceSource = "QR" | "LINK" | "ADMIN" | "IMPORT" | "MICROSOFT_FORMS";

export type PointTransactionType =
  | "ACTIVITY"
  | "MANUAL_ADJUSTMENT"
  | "BONUS"
  | "PENALTY"
  | "REVERSAL";

export type AuthProvider = "EMAIL_OTP" | "MICROSOFT_ENTRA";

export type AuthChallengeKind = "OTP" | "MAGIC_LINK";

export type CommitteeCreditStrategy = "FULL_CREDIT" | "FRACTIONAL_CREDIT";

export type BadgeType = "STREAK" | "POINTS" | "TOP" | "MVP" | "LEADER";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };
