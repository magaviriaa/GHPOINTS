import { NextRequest, NextResponse } from "next/server";
import { completeEntraCallback } from "@/server/auth/entra";
import { clientIp, clientUserAgent } from "@/server/auth/identity";
import { createSession, setSessionCookie } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { hasAdminRole } from "@/server/domain/authorization";
import { isDomainError, toUserMessage } from "@/server/domain/errors";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const login = new URL("/login", request.url);

  if (!code || !state) {
    login.searchParams.set("error", "No se completó el acceso con Microsoft. Usa el código por correo.");
    return NextResponse.redirect(login);
  }

  try {
    const result = await completeEntraCallback({ code, state });
    const session = await createSession({
      memberId: result.memberId,
      ip: await clientIp(),
      userAgent: await clientUserAgent(),
    });
    await setSessionCookie(session.token, session.expiresAt);

    const member = await prisma.member.findUnique({
      where: { id: result.memberId },
      include: { roles: true },
    });
    const isAdminUser = member ? hasAdminRole(member.roles) : false;
    const nextPath =
      isAdminUser && (result.next === "/app" || result.next === "/") ? "/admin" : result.next;
    return NextResponse.redirect(new URL(nextPath, request.url));
  } catch (error) {
    login.searchParams.set(
      "error",
      isDomainError(error) ? error.message : toUserMessage(error)
    );
    return NextResponse.redirect(login);
  }
}
