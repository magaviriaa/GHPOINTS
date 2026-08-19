import { NextRequest, NextResponse } from "next/server";
import { isEntraLoginEnabled } from "@/server/config/env";
import { buildEntraAuthorizationUrl } from "@/server/auth/entra";
import { toUserMessage } from "@/server/domain/errors";

export async function GET(request: NextRequest) {
  if (!isEntraLoginEnabled()) {
    return NextResponse.redirect(new URL("/login?error=entra", request.url));
  }
  const next = request.nextUrl.searchParams.get("next") ?? "/app";
  try {
    const url = await buildEntraAuthorizationUrl(next);
    return NextResponse.redirect(url);
  } catch (error) {
    const login = new URL("/login", request.url);
    login.searchParams.set("error", toUserMessage(error));
    return NextResponse.redirect(login);
  }
}
