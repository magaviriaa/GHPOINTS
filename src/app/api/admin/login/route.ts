import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { scryptSync, timingSafeEqual } from "crypto";

const COOKIE_NAME = "ghpoints_admin";

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function verifyPassword(plain: string, stored: string) {
  // Soporta 2 formatos:
  // 1) "scrypt$<saltHex>$<hashHex>" (recomendado)
  // 2) password en texto plano (por si ya crearon uno así)
  if (!stored) return false;

  if (!stored.startsWith("scrypt$")) {
    return safeEqual(plain, stored);
  }

  const parts = stored.split("$");
  if (parts.length !== 3) return false;

  const salt = Buffer.from(parts[1], "hex");
  const hash = Buffer.from(parts[2], "hex");
  const derived = scryptSync(plain, salt, hash.length);

  return timingSafeEqual(derived, hash);
}

export async function POST(req: NextRequest) {
  const token = process.env.ADMIN_SESSION_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Missing ADMIN_SESSION_TOKEN in .env" },
      { status: 500 }
    );
  }

  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Missing email/password" }, { status: 400 });
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin || !verifyPassword(password, admin.password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, name: admin.name });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12, // 12h
  });

  return res;
}