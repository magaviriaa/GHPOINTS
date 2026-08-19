import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

const CSP_HEADER = "content-security-policy";
const NONCE_HEADER = "x-nonce";

/**
 * Next reads the nonce out of the request's Content-Security-Policy header and
 * stamps it on its own inline bootstrap scripts, so the policy has to travel
 * both ways: forwarded on the request, emitted on the response.
 *
 * `strict-dynamic` makes the browser ignore host sources for scripts — only the
 * nonced bootstrap and whatever it loads can run. Styles keep `unsafe-inline`:
 * Next and Tailwind inject inline style tags, and there is no nonce path for
 * them today.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isProduction = process.env.NODE_ENV === "production";
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProduction ? [] : ["'unsafe-eval'"]),
  ].join(" ");
  const connectSrc = isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function sessionRedirect(req: NextRequest): NextResponse | null {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  const isApp = pathname === "/app" || pathname.startsWith("/app/");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");

  if ((isApp || isAdmin) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLogin && hasSession && !req.nextUrl.searchParams.get("next")) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return null;
}

export function proxy(req: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const csp = buildContentSecurityPolicy(nonce);

  const redirect = sessionRedirect(req);
  if (redirect) {
    redirect.headers.set(CSP_HEADER, csp);
    return redirect;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except Next's own static output and image files, so the policy
    // reaches every document. Auth redirects stay scoped inside sessionRedirect.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
