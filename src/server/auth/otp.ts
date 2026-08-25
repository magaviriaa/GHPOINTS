import "server-only";

import { db } from "@/server/db/prisma";
import { isoNow, isPast } from "@/server/db/time";
import { getAllowedEmailDomains, getEnv } from "@/server/config/env";
import { emailDomain, isAllowedEmailDomain, normalizeEmail } from "@/server/auth/email";
import {
  generateMagicToken,
  generateOtpCode,
  hashMagicToken,
  hashOtp,
  safeEqual,
} from "@/server/auth/secrets";
import { buildLoginEmail, getEmailSender } from "@/server/email/sender";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { canAuthenticate } from "@/server/domain/members-pure";

const EMAIL_WINDOW_MS = 15 * 60 * 1000;

export async function requestOtp(input: { email: string; ip?: string | null }) {
  const email = normalizeEmail(input.email);
  const allowed = getAllowedEmailDomains();

  if (!email.includes("@") || !isAllowedEmailDomain(email, allowed)) {
    throw new DomainError(
      ErrorCodes.INVALID_EMAIL_DOMAIN,
      "Usa tu correo institucional.",
      400
    );
  }

  await enforceOtpRateLimit(email, input.ip ?? null);

  const member = await db.orm.public.Member.where({ institutionalEmail: email }).first();

  if (!member || !canAuthenticate(member.status)) {
    return { delivered: false };
  }

  const env = getEnv();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000).toISOString();
  const code = generateOtpCode();
  const magicToken = generateMagicToken();

  await db.orm.public.AuthChallenge.createAll([
    {
      email,
      kind: "OTP",
      codeHash: hashOtp(email, code),
      expiresAt,
      ip: input.ip ?? null,
    },
    {
      email,
      kind: "MAGIC_LINK",
      codeHash: hashMagicToken(magicToken),
      expiresAt,
      ip: input.ip ?? null,
    },
  ]);

  const magicUrl = `${env.APP_URL}/login/magic?token=${encodeURIComponent(magicToken)}`;
  const ttlMinutes = Math.max(1, Math.round(env.OTP_TTL_SECONDS / 60));
  await getEmailSender().send({
    to: email,
    ...buildLoginEmail({ code, magicUrl, ttlMinutes }),
  });
  return { delivered: true, domain: emailDomain(email) };
}

export async function verifyOtp(input: { email: string; code: string; ip?: string | null }) {
  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\s/g, "");

  const challenge = await db.orm.public.AuthChallenge.where({
    email,
    kind: "OTP",
    consumedAt: null,
  })
    .orderBy((row) => row.createdAt.desc())
    .first();

  if (!challenge) {
    throw new DomainError(ErrorCodes.OTP_INVALID, "El código no es válido.", 400);
  }

  if (isPast(challenge.expiresAt)) {
    throw new DomainError(ErrorCodes.OTP_EXPIRED, "El código expiró. Solicita uno nuevo.", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new DomainError(
      ErrorCodes.OTP_RATE_LIMITED,
      "Demasiados intentos. Solicita un código nuevo.",
      429
    );
  }

  const matches = safeEqual(challenge.codeHash, hashOtp(email, code));
  if (!matches) {
    await db.orm.public.AuthChallenge.where({ id: challenge.id }).update({
      attempts: challenge.attempts + 1,
    });
    throw new DomainError(ErrorCodes.OTP_INVALID, "El código no es válido.", 400);
  }

  return consumeChallengesAndLoadMember(email, challenge.id);
}

export async function consumeMagicLink(input: { token: string; ip?: string | null }) {
  const token = input.token.trim();
  if (token.length < 16) {
    throw new DomainError(ErrorCodes.OTP_INVALID, "El enlace no es válido.", 400);
  }

  const challenge = await db.orm.public.AuthChallenge.where({
    kind: "MAGIC_LINK",
    codeHash: hashMagicToken(token),
    consumedAt: null,
  })
    .orderBy((row) => row.createdAt.desc())
    .first();

  if (!challenge) {
    throw new DomainError(ErrorCodes.OTP_INVALID, "El enlace no es válido.", 400);
  }

  if (isPast(challenge.expiresAt)) {
    throw new DomainError(ErrorCodes.OTP_EXPIRED, "El enlace expiró. Solicita uno nuevo.", 400);
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    throw new DomainError(
      ErrorCodes.OTP_RATE_LIMITED,
      "Demasiados intentos. Solicita un código nuevo.",
      429
    );
  }

  return consumeChallengesAndLoadMember(challenge.email, challenge.id);
}

async function consumeChallengesAndLoadMember(email: string, challengeId: string) {
  const member = await db.orm.public.Member.where({ institutionalEmail: email })
    .include("roles", (roles) => roles.select("role", "committeeId"))
    .first();
  if (!member || !canAuthenticate(member.status)) {
    throw new DomainError(
      ErrorCodes.MEMBER_INACTIVE,
      "No pudimos iniciar sesión con ese correo.",
      403
    );
  }

  const now = isoNow();
  await db.transaction(async (tx) => {
    await tx.orm.public.AuthChallenge.where({ id: challengeId }).update({ consumedAt: now });
    await tx.orm.public.AuthChallenge.where({ email, consumedAt: null })
      .where((row) => row.id.neq(challengeId))
      .updateAll({ consumedAt: now });
    await tx.orm.public.IdentityAccount.upsert({
      create: {
        memberId: member.id,
        provider: "EMAIL_OTP",
        providerUserId: email,
        lastLoginAt: now,
      },
      update: { lastLoginAt: now, memberId: member.id },
      conflictOn: { provider: "EMAIL_OTP", providerUserId: email },
    });
  });

  return member;
}

async function enforceOtpRateLimit(email: string, ip: string | null) {
  const { OTP_MAX_PER_EMAIL, OTP_MAX_PER_IP } = getEnv();
  const since = new Date(Date.now() - EMAIL_WINDOW_MS).toISOString();
  const { emailCount } = await db.orm.public.AuthChallenge.where({ email, kind: "OTP" })
    .where((row) => row.createdAt.gte(since))
    .aggregate((agg) => ({ emailCount: agg.count() }));
  if (emailCount >= OTP_MAX_PER_EMAIL) {
    throw new DomainError(
      ErrorCodes.OTP_RATE_LIMITED,
      "Demasiados intentos. Espera unos minutos.",
      429
    );
  }

  if (ip) {
    const { ipCount } = await db.orm.public.AuthChallenge.where({ ip, kind: "OTP" })
      .where((row) => row.createdAt.gte(since))
      .aggregate((agg) => ({ ipCount: agg.count() }));
    if (ipCount >= OTP_MAX_PER_IP) {
      throw new DomainError(
        ErrorCodes.OTP_RATE_LIMITED,
        "Demasiados intentos. Espera unos minutos.",
        429
      );
    }
  }
}
