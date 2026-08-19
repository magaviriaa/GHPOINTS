"use server";

import { z } from "zod";
import { getCurrentActor } from "@/server/auth/session";
import { requireActor } from "@/server/domain/authorization";
import { registerAttendance } from "@/server/domain/attendance";
import { toUserMessage } from "@/server/domain/errors";

const schema = z.object({
  publicId: z.string().min(4),
  source: z.enum(["QR", "LINK"]),
  token: z.string().optional(),
});

export async function registerAttendanceAction(formData: FormData) {
  try {
    const actor = requireActor(await getCurrentActor());
    const parsed = schema.parse({
      publicId: String(formData.get("publicId") ?? ""),
      source: String(formData.get("source") ?? "LINK"),
      token: String(formData.get("token") ?? "") || undefined,
    });
    const attendance = await registerAttendance({
      actor,
      publicId: parsed.publicId,
      token: parsed.token,
      source: parsed.source,
    });
    return { ok: true as const, attendanceId: attendance.id, status: attendance.status };
  } catch (error) {
    return { ok: false as const, message: toUserMessage(error) };
  }
}
