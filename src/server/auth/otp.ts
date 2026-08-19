import "server-only";

import { prisma } from "@/server/db/prisma";
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

  const member = await prisma.member.findUnique({
    where: { institutionalEmail: email },
  });

  if (!member || member.status !== "ACTIVE") {
    return { delivered: false };
  }

  const env = getEnv();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
  const code = generateOtpCode();
  const magicToken = generateMagicToken();

  await prisma.authChallenge.createMany({
    data: [
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
    ],
  });

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

  const challenge = await prisma.authChallenge.findFirst({
    where: { email, kind: "OTP", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    throw new DomainError(ErrorCodes.OTP_INVALID, "El código no es válido.", 400);
  }

  if (challenge.expiresAt < new Date()) {
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
    await prisma.authChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
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

  const challenge = await prisma.authChallenge.findFirst({
    where: {
      kind: "MAGIC_LINK",
      codeHash: hashMagicToken(token),
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    throw new DomainError(ErrorCodes.OTP_INVALID, "El enlace no es válido.", 400);
  }

  if (challenge.expiresAt < new Date()) {
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
  const member = await prisma.member.findUnique({
    where: { institutionalEmail: email },
    include: { roles: true },
  });
  if (!member || member.status !== "ACTIVE") {
    throw new DomainError(
      ErrorCodes.MEMBER_INACTIVE,
      "No pudimos iniciar sesión con ese correo.",
      403
    );
  }

  await prisma.$transaction([
    prisma.authChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    }),
    prisma.authChallenge.updateMany({
      where: { email, consumedAt: null, id: { not: challengeId } },
      data: { consumedAt: new Date() },
    }),
    prisma.identityAccount.upsert({
      where: {
        provider_providerUserId: {
          provider: "EMAIL_OTP",
          providerUserId: email,
        },
      },
      update: { lastLoginAt: new Date(), memberId: member.id },
      create: {
        memberId: member.id,
        provider: "EMAIL_OTP",
        providerUserId: email,
        lastLoginAt: new Date(),
      },
    }),
  ]);

  return member;
}

async function enforceOtpRateLimit(email: string, ip: string | null) {
  const { OTP_MAX_PER_EMAIL, OTP_MAX_PER_IP } = getEnv();
  const since = new Date(Date.now() - EMAIL_WINDOW_MS);
  const emailCount = await prisma.authChallenge.count({
    where: { email, kind: "OTP", createdAt: { gte: since } },
  });
  if (emailCount >= OTP_MAX_PER_EMAIL) {
    throw new DomainError(
      ErrorCodes.OTP_RATE_LIMITED,
      "Demasiados intentos. Espera unos minutos.",
      429
    );
  }

  if (ip) {
    const ipCount = await prisma.authChallenge.count({
      where: { ip, kind: "OTP", createdAt: { gte: since } },
    });
    if (ipCount >= OTP_MAX_PER_IP) {
      throw new DomainError(
        ErrorCodes.OTP_RATE_LIMITED,
        "Demasiados intentos. Espera unos minutos.",
        429
      );
    }
  }
}
