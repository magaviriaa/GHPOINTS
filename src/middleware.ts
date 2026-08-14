import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "ghpoints_admin";

function isAuthed(req: NextRequest) {
  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) return false;
  return req.cookies.get(COOKIE_NAME)?.value === token;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Deja pasar la pantalla de login y los endpoints de auth
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  // Protege páginas /admin/*
  if (pathname.startsWith("/admin")) {
    if (!isAuthed(req)) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  // Protege API de escritura (todo lo que NO sea GET/HEAD/OPTIONS)
  if (pathname.startsWith("/api")) {
    const method = req.method.toUpperCase();
    const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

    if (!isRead && !isAuthed(req)) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};