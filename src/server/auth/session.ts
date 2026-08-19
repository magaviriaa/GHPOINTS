import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/server/db/prisma";
import { getEnv } from "@/server/config/env";
import type { Actor } from "@/server/domain/authorization";
import { SESSION_COOKIE } from "@/lib/constants";
import { generateSessionToken, hashSecret } from "@/server/auth/secrets";
import { schedulePruneExpiredAuthRows } from "@/server/auth/prune";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export async function createSession(input: {
  memberId: string;
  userAgent?: string | null;
  ip?: string | null;
}) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      memberId: input.memberId,
      tokenHash: hashSecret(token),
      expiresAt,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
    },
  });
  schedulePruneExpiredAuthRows();
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({
    where: { tokenHash: hashSecret(token) },
  });
}

export async function destroyMemberSessions(memberId: string) {
  await prisma.session.deleteMany({ where: { memberId } });
}

async function readActorFromToken(token: string): Promise<Actor | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSecret(token) },
    include: {
      member: {
        include: { roles: true },
      },
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  if (session.member.status !== "ACTIVE") {
    await prisma.session.deleteMany({ where: { memberId: session.memberId } });
    return null;
  }

  return {
    id: session.member.id,
    fullName: session.member.fullName,
    institutionalEmail: session.member.institutionalEmail,
    memberType: session.member.memberType,
    status: session.member.status,
    sessionId: session.id,
    roles: session.member.roles.map((role) => ({
      role: role.role,
      committeeId: role.committeeId,
    })),
  };
}

export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readActorFromToken(token);
});

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
