"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { completeEmailOtp, consumeMagicLinkLogin, logoutCurrentSession, startEmailOtp } from "@/server/auth/identity";
import { hasAdminRole } from "@/server/domain/authorization";
import { toUserMessage } from "@/server/domain/errors";
import { safePostLoginPath } from "@/lib/redirect";

const emailSchema = z.string().email("Ingresa un correo válido.");
const otpSchema = z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos.");

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function requestOtpAction(formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Correo inválido." };
  }
  try {
    await startEmailOtp(parsed.data);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? ""));
  const code = otpSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  const next = String(formData.get("next") ?? "/app");
  if (!email.success) {
    return { ok: false, message: email.error.issues[0]?.message ?? "Correo inválido." };
  }
  if (!code.success) {
    return { ok: false, message: code.error.issues[0]?.message ?? "Código inválido." };
  }

  let isAdminUser = false;
  try {
    const member = await completeEmailOtp(email.data, code.data);
    isAdminUser = hasAdminRole(member.roles);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }

  const safeNext = safePostLoginPath(next);
  redirect(isAdminUser && (safeNext === "/app" || safeNext === "/") ? "/admin" : safeNext);
}

export async function consumeMagicLinkAction(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "").trim();
  const next = String(formData.get("next") ?? "/app");
  if (token.length < 16) {
    return { ok: false, message: "El enlace no es válido." };
  }

  let isAdminUser = false;
  try {
    const member = await consumeMagicLinkLogin(token);
    isAdminUser = hasAdminRole(member.roles);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }

  const safeNext = safePostLoginPath(next);
  redirect(isAdminUser && (safeNext === "/app" || safeNext === "/") ? "/admin" : safeNext);
}

export async function logoutAction() {
  await logoutCurrentSession();
  redirect("/login");
}
