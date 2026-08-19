import "server-only";

import { cookies, headers } from "next/headers";
import { requestOtp, verifyOtp, consumeMagicLink } from "@/server/auth/otp";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getCurrentActor,
  SESSION_COOKIE,
  setSessionCookie,
} from "@/server/auth/session";

export async function clientIp(): Promise<string | null> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headerStore.get("x-real-ip");
}

export async function clientUserAgent(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get("user-agent");
}

export async function startEmailOtp(email: string) {
  const ip = await clientIp();
  await requestOtp({ email, ip });
}

export async function completeEmailOtp(email: string, code: string) {
  const ip = await clientIp();
  const member = await verifyOtp({ email, code, ip });
  const session = await createSession({
    memberId: member.id,
    ip,
    userAgent: await clientUserAgent(),
  });
  await setSessionCookie(session.token, session.expiresAt);
  return member;
}

export async function consumeMagicLinkLogin(token: string) {
  const ip = await clientIp();
  const member = await consumeMagicLink({ token, ip });
  const session = await createSession({
    memberId: member.id,
    ip,
    userAgent: await clientUserAgent(),
  });
  await setSessionCookie(session.token, session.expiresAt);
  return member;
}

export async function logoutCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await destroySession(token);
  }
  await clearSessionCookie();
}

export { getCurrentActor };
