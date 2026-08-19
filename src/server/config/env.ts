import "server-only";

import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  APP_URL: z.string().url(),
  INSTITUTIONAL_EMAIL_DOMAINS: z.string().min(1),
  APP_TIMEZONE: z.string().default("America/Bogota"),
  EMAIL_FROM: z.string().default("GH Points <noreply@localhost>"),
  RESEND_API_KEY: z.string().optional().default(""),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_FIXED_CODE: z.string().optional().default(""),
  OTP_MAX_PER_EMAIL: z.coerce.number().int().positive().default(5),
  OTP_MAX_PER_IP: z.coerce.number().int().positive().default(12),
  MAGIC_LINK_SECRET: z.string().optional().default(""),
  IMPORT_SECRET: z.string().optional().default(""),
  AUTH_PROVIDERS: z.string().optional().default("email_otp"),
  ENTRA_CLIENT_ID: z.string().optional().default(""),
  ENTRA_CLIENT_SECRET: z.string().optional().default(""),
  ENTRA_TENANT_ID: z.string().optional().default(""),
  ENTRA_ALLOWED_TIDS: z.string().optional().default(""),
  TEAMS_WEBHOOK_URL: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function resetEnvCache() {
  cached = null;
}

export function getAllowedEmailDomains(): string[] {
  return getEnv()
    .INSTITUTIONAL_EMAIL_DOMAINS.split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export type AuthProviderName = "email_otp" | "entra";

export function getEnabledAuthProviders(): AuthProviderName[] {
  const names = getEnv()
    .AUTH_PROVIDERS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const enabled: AuthProviderName[] = [];
  for (const name of names) {
    if (name === "email_otp" || name === "entra") {
      if (!enabled.includes(name)) enabled.push(name);
    }
  }
  if (!enabled.includes("email_otp")) {
    enabled.unshift("email_otp");
  }
  return enabled;
}

export function isEntraConfigured(): boolean {
  const env = getEnv();
  return (
    env.ENTRA_CLIENT_ID.trim().length > 0 &&
    env.ENTRA_CLIENT_SECRET.trim().length > 0 &&
    env.ENTRA_TENANT_ID.trim().length > 0
  );
}

export function isEntraLoginEnabled(): boolean {
  return getEnabledAuthProviders().includes("entra") && isEntraConfigured();
}

export function getMagicLinkSecret(): string {
  const env = getEnv();
  const dedicated = env.MAGIC_LINK_SECRET.trim();
  return dedicated.length > 0 ? dedicated : env.SESSION_SECRET;
}

export function getEntraAllowedTids(): string[] {
  return getEnv()
    .ENTRA_ALLOWED_TIDS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getTeamsWebhookUrl(): string | null {
  const url = getEnv().TEAMS_WEBHOOK_URL.trim();
  return url.length > 0 ? url : null;
}
