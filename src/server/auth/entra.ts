import "server-only";

import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db/prisma";
import { isoNow } from "@/server/db/time";
import {
  getAllowedEmailDomains,
  getEntraAllowedTids,
  getEnv,
  isEntraConfigured,
} from "@/server/config/env";
import { isAllowedEmailDomain, normalizeEmail } from "@/server/auth/email";
import { hashSecret, safeEqual } from "@/server/auth/secrets";
import { ENTRA_STATE_COOKIE } from "@/lib/constants";
import { entraEmailFromClaims, isEntraTidAllowed } from "@/server/auth/entra-pure";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { canAuthenticate } from "@/server/domain/members-pure";

const STATE_TTL_MS = 10 * 60 * 1000;

const entraStateSchema = z.object({
  nonce: z.string().min(8),
  next: z.string().min(1),
  verifier: z.string().min(8),
  exp: z.number(),
});

const entraTokenSchema = z.object({
  id_token: z.string().min(16),
});

const entraClaimsSchema = z.object({
  oid: z.string().min(1),
  tid: z.string().min(1),
  nonce: z.string().min(1),
  email: z.string().optional(),
  preferred_username: z.string().optional(),
  upn: z.string().optional(),
});

type EntraState = z.infer<typeof entraStateSchema>;

function redirectUri(): string {
  return `${getEnv().APP_URL}/api/auth/entra/callback`;
}

function authorizeUrl(): string {
  const { ENTRA_TENANT_ID } = getEnv();
  return `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/authorize`;
}

function tokenUrl(): string {
  const { ENTRA_TENANT_ID } = getEnv();
  return `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/oauth2/v2.0/token`;
}

function signState(state: EntraState): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = hashSecret(`${getEnv().SESSION_SECRET}:entra:${payload}`);
  return `${payload}.${sig}`;
}

function readState(raw: string): EntraState {
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft expiró.", 401);
  }
  const expected = hashSecret(`${getEnv().SESSION_SECRET}:entra:${parts[0]}`);
  if (!safeEqual(expected, parts[1])) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }
  const parsed = entraStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }
  if (parsed.data.exp < Date.now()) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft expiró.", 401);
  }
  return parsed.data;
}

export async function buildEntraAuthorizationUrl(next: string): Promise<string> {
  if (!isEntraConfigured()) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "El acceso con Microsoft no está configurado.",
      400
    );
  }
  const env = getEnv();
  const nonce = randomBytes(16).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const safeNext = next.startsWith("/") ? next : "/app";
  const state: EntraState = {
    nonce,
    next: safeNext,
    verifier,
    exp: Date.now() + STATE_TTL_MS,
  };
  const store = await cookies();
  store.set(ENTRA_STATE_COOKIE, signState(state), {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(state.exp),
  });

  const params = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state: nonce,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${authorizeUrl()}?${params.toString()}`;
}

export async function completeEntraCallback(input: {
  code: string;
  state: string;
}): Promise<{ memberId: string; next: string }> {
  if (!isEntraConfigured()) {
    throw new DomainError(
      ErrorCodes.VALIDATION,
      "El acceso con Microsoft no está configurado.",
      400
    );
  }

  const store = await cookies();
  const raw = store.get(ENTRA_STATE_COOKIE)?.value;
  store.set(ENTRA_STATE_COOKIE, "", { path: "/", expires: new Date(0) });
  if (!raw) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft expiró.", 401);
  }
  const pending = readState(raw);
  if (pending.nonce !== input.state) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }

  const env = getEnv();
  const body = new URLSearchParams({
    client_id: env.ENTRA_CLIENT_ID,
    client_secret: env.ENTRA_CLIENT_SECRET,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: redirectUri(),
    code_verifier: pending.verifier,
  });

  const tokenResponse = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    throw new DomainError(
      ErrorCodes.UNAUTHORIZED,
      "Microsoft no pudo completar el acceso. Usa el código por correo.",
      401
    );
  }

  const tokenJson: unknown = await tokenResponse.json();
  const tokenParsed = entraTokenSchema.safeParse(tokenJson);
  if (!tokenParsed.success) {
    throw new DomainError(
      ErrorCodes.UNAUTHORIZED,
      "Microsoft no pudo completar el acceso. Usa el código por correo.",
      401
    );
  }

  const jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`)
  );
  const verified = await jwtVerify(tokenParsed.data.id_token, jwks, {
    audience: env.ENTRA_CLIENT_ID,
  });
  const claimsParsed = entraClaimsSchema.safeParse(verified.payload);
  if (!claimsParsed.success) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }
  const claims = claimsParsed.data;
  if (claims.nonce !== pending.nonce) {
    throw new DomainError(ErrorCodes.UNAUTHORIZED, "La sesión de Microsoft no es válida.", 401);
  }
  if (!isEntraTidAllowed(claims.tid, env.ENTRA_TENANT_ID, getEntraAllowedTids())) {
    throw new DomainError(
      ErrorCodes.FORBIDDEN,
      "Este directorio de Microsoft no está permitido.",
      403
    );
  }

  const email = entraEmailFromClaims({
    email: claims.email,
    preferred_username: claims.preferred_username,
    upn: claims.upn,
  });
  if (!email || !isAllowedEmailDomain(email, getAllowedEmailDomains())) {
    throw new DomainError(
      ErrorCodes.INVALID_EMAIL_DOMAIN,
      "Usa tu correo institucional.",
      400
    );
  }

  const member = await db.orm.public.Member.where({
    institutionalEmail: normalizeEmail(email),
  }).first();
  if (!member || !canAuthenticate(member.status)) {
    throw new DomainError(
      ErrorCodes.MEMBER_INACTIVE,
      "Tu correo no está en la lista de integrantes.",
      403
    );
  }

  await db.orm.public.IdentityAccount.upsert({
    create: {
      memberId: member.id,
      provider: "MICROSOFT_ENTRA",
      providerUserId: claims.oid,
      microsoftOid: claims.oid,
      microsoftTid: claims.tid,
      lastLoginAt: isoNow(),
    },
    update: {
      memberId: member.id,
      microsoftOid: claims.oid,
      microsoftTid: claims.tid,
      lastLoginAt: isoNow(),
    },
    conflictOn: { provider: "MICROSOFT_ENTRA", providerUserId: claims.oid },
  });

  return { memberId: member.id, next: pending.next };
}
