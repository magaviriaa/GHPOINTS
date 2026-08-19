import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, service: "gh-points", db: "up" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "gh-points", db: "down" },
      { status: 503 }
    );
  }
}
