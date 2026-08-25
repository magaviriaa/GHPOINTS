import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { getEnv, getMagicLinkSecret } from "@/server/config/env";

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashOtp(email: string, code: string): string {
  const { SESSION_SECRET } = getEnv();
  return hashSecret(`${SESSION_SECRET}:${email}:${code}`);
}

export function hashMagicToken(token: string): string {
  return hashSecret(`${getMagicLinkSecret()}:${token}`);
}

export function hashAttendanceToken(activityId: string, token: string): string {
  const { SESSION_SECRET } = getEnv();
  return hashSecret(`${SESSION_SECRET}:att:${activityId}:${token}`);
}

export function generateOtpCode(): string {
  const env = getEnv();
  if (env.NODE_ENV !== "production" && env.OTP_FIXED_CODE) {
    return env.OTP_FIXED_CODE;
  }
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateMagicToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateAttendanceToken(): string {
  return randomBytes(18).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
