"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/server/auth/session";
import { clientIp } from "@/server/auth/identity";
import { fromLocalInput } from "@/lib/dates";
import { proposeActivity } from "@/server/domain/activities";
import { requireCommitteeLeader } from "@/server/domain/authorization";
import { toUserMessage } from "@/server/domain/errors";
import { num, parseEnum, str } from "@/server/actions/form-parse";

type Result = { ok: true } | { ok: false; message: string };

export async function leaderProposeActivityAction(formData: FormData): Promise<Result> {
  try {
    const committeeId = str(formData, "committeeId");
    const actor = requireCommitteeLeader(await getCurrentActor(), committeeId);
    const ip = await clientIp();
    await proposeActivity({
      actor,
      committeeId,
      name: str(formData, "name"),
      description: str(formData, "description"),
      activityType: parseEnum(
        str(formData, "activityType") || "GENERAL",
        ["GENERAL", "SPORTS", "TALK", "WORKSHOP", "SOCIAL", "OTHER"] as const
      ),
      startsAt: fromLocalInput(str(formData, "startsAt")),
      registrationStart: fromLocalInput(str(formData, "registrationStart")),
      registrationEnd: fromLocalInput(str(formData, "registrationEnd")),
      individualPoints: num(formData, "individualPoints"),
      approvalMode: parseEnum(str(formData, "approvalMode") || "AUTO", ["AUTO", "MANUAL"] as const),
      ip,
    });
    revalidatePath("/app/committees");
    revalidatePath(`/app/committees/${str(formData, "committeeSlug")}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
