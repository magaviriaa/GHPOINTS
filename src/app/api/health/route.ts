import { NextResponse } from "next/server";
import { db } from "@/server/db/prisma";

export async function GET() {
  try {
    const plan = db.raw.sql`SELECT 1 AS ok`.returnsRow({ ok: "pg/int4@1" }).build();
    await db.runtime().query(plan);
    return NextResponse.json({ ok: true, service: "gh-points", db: "up" });
  } catch {
    return NextResponse.json(
      { ok: false, service: "gh-points", db: "down" },
      { status: 503 }
    );
  }
}
