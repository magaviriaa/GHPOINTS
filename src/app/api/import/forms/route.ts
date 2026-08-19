import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/server/auth/session";
import { isAdmin } from "@/server/domain/authorization";
import { getEnv } from "@/server/config/env";
import { safeEqual } from "@/server/auth/secrets";
import { formsJsonBodySchema, importFormsAttendances } from "@/server/domain/import";
import { toUserMessage } from "@/server/domain/errors";

export async function POST(request: NextRequest) {
  const env = getEnv();
  const authHeader = request.headers.get("authorization");
  const secret = env.IMPORT_SECRET;
  const actor = await getCurrentActor();
  const bearerOk = secret.length > 0 && safeEqual(authHeader ?? "", `Bearer ${secret}`);
  const adminOk = actor && isAdmin(actor);

  if (!bearerOk && !adminOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const parsed = formsJsonBodySchema.parse(json);
    const result = await importFormsAttendances({
      actor,
      rows: parsed.rows.map((row) => ({
        email: row.email,
        activityKey: row.activityKey,
        registeredAt: row.registeredAt ? new Date(row.registeredAt) : undefined,
      })),
      source: "MICROSOFT_FORMS",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: toUserMessage(error) }, { status: 400 });
  }
}
