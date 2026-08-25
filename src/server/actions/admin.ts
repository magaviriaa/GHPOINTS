"use server";

import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/server/auth/session";
import { clientIp } from "@/server/auth/identity";
import { fromLocalInput } from "@/lib/dates";
import { adminRegisterAttendance, decideAttendance } from "@/server/domain/attendance";
import {
  cancelActivity,
  createActivity,
  disableAttendanceToken,
  publishProposedActivity,
  rejectProposedActivity,
  rotateActivityPublicId,
  rotateAttendanceToken,
  transitionActivity,
  updateActivity,
} from "@/server/domain/activities";
import { createCommittee, updateCommittee } from "@/server/domain/committees";
import {
  createMember,
  setMemberCommittees,
  setMemberRoles,
  updateMember,
} from "@/server/domain/members";
import { assignManualPoints, bulkAwardActivity, reversePoints } from "@/server/domain/admin-points";
import { createSeason, getActiveSeason, updateSeasonStatus } from "@/server/domain/season";
import { recomputeSeasonScores } from "@/server/domain/scoring";
import { setConfigValue } from "@/server/config/app-config";
import {
  commitMemberImport,
  commitFormsImport,
  loadMemberImportPreview,
  loadFormsImportPreview,
  parseTabular,
  previewFormsImport,
  previewMemberImport,
  saveFormsImportPreview,
  saveMemberImportPreview,
} from "@/server/domain/import";
import { DomainError, ErrorCodes, toUserMessage } from "@/server/domain/errors";
import { requireAdmin, type Actor } from "@/server/domain/authorization";
import { dispatchAppEvent } from "@/server/notify/events";
import { MEMBER_STATUS_VALUES } from "@/lib/constants";
import { num, parseEnum, str, strs } from "@/server/actions/form-parse";

type Result = { ok: true } | { ok: false; message: string };

async function runAdminAction(
  formData: FormData,
  paths: string[],
  handler: (ctx: { actor: Actor; ip: string | null }, formData: FormData) => Promise<void>
): Promise<Result> {
  try {
    const actor = requireAdmin(await getCurrentActor());
    const ip = await clientIp();
    await handler({ actor, ip }, formData);
    for (const path of paths) {
      revalidatePath(path);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function adminCreateMemberAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/members"], async ({ actor, ip }, data) => {
    await createMember({
      actor,
      fullName: str(data, "fullName"),
      institutionalEmail: str(data, "institutionalEmail"),
      memberType: parseEnum(str(data, "memberType") || "NEW", ["NEW", "ACTIVE"] as const),
      committeeIds: strs(data, "committeeIds"),
      ip,
    });
  });
}

export async function adminUpdateMemberAction(formData: FormData): Promise<Result> {
  const memberId = str(formData, "memberId");
  return runAdminAction(
    formData,
    ["/admin/members", `/admin/members/${memberId}`],
    async ({ actor, ip }, data) => {
      await updateMember({
        actor,
        memberId,
        fullName: str(data, "fullName"),
        institutionalEmail: str(data, "institutionalEmail"),
        memberType: parseEnum(str(data, "memberType") || "NEW", ["NEW", "ACTIVE"] as const),
        status: parseEnum(str(data, "status") || "ACTIVE", MEMBER_STATUS_VALUES),
        ip,
      });
      await setMemberCommittees({
        actor,
        memberId,
        committeeIds: strs(data, "committeeIds"),
        ip,
      });
      await setMemberRoles({
        actor,
        memberId,
        isAdmin: str(data, "isAdmin") === "on",
        leaderCommitteeIds: strs(data, "leaderCommitteeIds"),
        ip,
      });
    }
  );
}

export async function adminCreateCommitteeAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/committees"], async ({ actor, ip }, data) => {
    await createCommittee({
      actor,
      name: str(data, "name"),
      color: str(data, "color") || "#1e3a5f",
      ip,
    });
  });
}

export async function adminUpdateCommitteeAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/committees"], async ({ actor, ip }, data) => {
    await updateCommittee({
      actor,
      committeeId: str(data, "committeeId"),
      name: str(data, "name"),
      color: str(data, "color"),
      status: parseEnum(str(data, "status") || "ACTIVE", ["ACTIVE", "INACTIVE"] as const),
      ip,
    });
  });
}

export async function adminCreateSeasonAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/seasons"], async ({ actor, ip }, data) => {
    await createSeason({
      actor,
      name: str(data, "name"),
      startDate: new Date(str(data, "startDate")),
      endDate: new Date(str(data, "endDate")),
      status: parseEnum(str(data, "status") || "UPCOMING", ["UPCOMING", "ACTIVE", "CLOSED"] as const),
      ip,
    });
  });
}

export async function adminUpdateSeasonStatusAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/seasons"], async ({ actor, ip }, data) => {
    await updateSeasonStatus({
      actor,
      seasonId: str(data, "seasonId"),
      status: parseEnum(str(data, "status") || "UPCOMING", ["UPCOMING", "ACTIVE", "CLOSED"] as const),
      ip,
    });
  });
}

export async function adminCreateActivityAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await createActivity({
      actor,
      name: str(data, "name"),
      description: str(data, "description"),
      activityType: parseEnum(
        str(data, "activityType") || "GENERAL",
        ["GENERAL", "SPORTS", "TALK", "WORKSHOP", "SOCIAL", "OTHER"] as const
      ),
      startsAt: fromLocalInput(str(data, "startsAt")),
      registrationStart: fromLocalInput(str(data, "registrationStart")),
      registrationEnd: fromLocalInput(str(data, "registrationEnd")),
      individualPoints: num(data, "individualPoints"),
      approvalMode: parseEnum(str(data, "approvalMode") || "AUTO", ["AUTO", "MANUAL"] as const),
      status: parseEnum(str(data, "status") || "OPEN", ["DRAFT", "OPEN"] as const),
      ip,
    });
  });
}

export async function adminUpdateActivityAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await updateActivity({
      actor,
      activityId: str(data, "activityId"),
      name: str(data, "name"),
      description: str(data, "description"),
      startsAt: fromLocalInput(str(data, "startsAt")),
      registrationStart: fromLocalInput(str(data, "registrationStart")),
      registrationEnd: fromLocalInput(str(data, "registrationEnd")),
      individualPoints: num(data, "individualPoints"),
      approvalMode: parseEnum(str(data, "approvalMode") || "AUTO", ["AUTO", "MANUAL"] as const),
      ip,
    });
  });
}

export async function adminTransitionActivityAction(formData: FormData): Promise<Result> {
  const activityId = str(formData, "activityId");
  return runAdminAction(
    formData,
    ["/admin/activities", `/admin/activities/${activityId}`, "/admin/attendance"],
    async ({ actor, ip }, data) => {
      const activity = await transitionActivity({
        actor,
        activityId,
        to: parseEnum(str(data, "to"), ["OPEN", "CLOSED", "PROCESSED"] as const),
        ip,
      });
      if (activity.status === "OPEN") {
        dispatchAppEvent({ type: "ACTIVITY_OPENED", activityName: activity.name });
      }
    }
  );
}

export async function adminCancelActivityAction(formData: FormData): Promise<Result> {
  const activityId = str(formData, "activityId");
  return runAdminAction(
    formData,
    ["/admin/activities", `/admin/activities/${activityId}`, "/admin/attendance"],
    async ({ actor, ip }, data) => {
      await cancelActivity({
        actor,
        activityId,
        reason: str(data, "reason"),
        ip,
      });
    }
  );
}

export async function adminRotateQrAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await rotateActivityPublicId({
      actor,
      activityId: str(data, "activityId"),
      ip,
    });
  });
}

export async function adminApproveAttendanceAction(formData: FormData): Promise<Result> {
  return runAdminAction(
    formData,
    ["/admin/activities", "/admin/attendance"],
    async ({ actor, ip }, data) => {
      await decideAttendance({
        actor,
        attendanceIds: [str(data, "attendanceId")],
        to: "APPROVED",
        ip,
      });
    }
  );
}

export async function adminBulkApproveAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities", "/admin/attendance"], async ({ actor, ip }, data) => {
    await decideAttendance({
      actor,
      attendanceIds: strs(data, "attendanceIds"),
      to: "APPROVED",
      ip,
    });
  });
}

export async function adminRejectAttendanceAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities", "/admin/attendance"], async ({ actor, ip }, data) => {
    await decideAttendance({
      actor,
      attendanceIds: [str(data, "attendanceId")],
      to: "REJECTED",
      ip,
    });
  });
}

export async function adminCancelAttendanceAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await decideAttendance({
      actor,
      attendanceIds: [str(data, "attendanceId")],
      to: "CANCELLED",
      reason: str(data, "reason"),
      ip,
    });
  });
}

export async function adminAddAttendanceAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await adminRegisterAttendance({
      actor,
      activityId: str(data, "activityId"),
      memberId: str(data, "memberId"),
      ip,
    });
  });
}

export async function adminAssignPointsAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/points"], async ({ actor, ip }, data) => {
    await assignManualPoints({
      actor,
      memberId: str(data, "memberId"),
      points: num(data, "points"),
      reason: str(data, "reason"),
      ip,
    });
  });
}

export async function adminReversePointsAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/points"], async ({ actor, ip }, data) => {
    await reversePoints({
      actor,
      transactionId: str(data, "transactionId"),
      reason: str(data, "reason") || "Reversión administrativa",
      ip,
    });
  });
}

export async function adminBulkAwardAction(formData: FormData): Promise<Result> {
  return runAdminAction(
    formData,
    ["/admin/points", "/admin/activities"],
    async ({ actor, ip }, data) => {
      await bulkAwardActivity({
        actor,
        activityId: str(data, "activityId"),
        memberIds: strs(data, "memberIds"),
        ip,
      });
    }
  );
}

export async function adminSaveConfigAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/settings"], async ({ actor, ip }, data) => {
    await setConfigValue({
      key: "committee_credit_strategy",
      value: parseEnum(
        str(data, "committee_credit_strategy") || "FULL_CREDIT",
        ["FULL_CREDIT", "FRACTIONAL_CREDIT"] as const
      ),
      updatedById: actor.id,
      ip,
    });
    const season = await getActiveSeason();
    if (season) {
      await recomputeSeasonScores(season.id);
    }
  });
}

export async function adminPreviewImportAction(formData: FormData) {
  try {
    const actor = requireAdmin(await getCurrentActor());
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false as const, message: "Adjunta un archivo CSV o XLSX." };
    }
    const buffer = await file.arrayBuffer();
    const rows = parseTabular(buffer, file.name, "MEMBERS");
    const preview = await previewMemberImport(rows);
    const previewId = await saveMemberImportPreview({
      actor,
      filename: file.name,
      preview,
    });
    return {
      ok: true as const,
      previewId,
      filename: file.name,
      valid: preview.valid.length,
      warnings: preview.warnings,
      errors: preview.errors,
    };
  } catch (error) {
    return { ok: false as const, message: toUserMessage(error) };
  }
}

export async function adminCommitImportAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/members", "/admin/imports"], async ({ actor, ip }, data) => {
    const loaded = await loadMemberImportPreview({ actor, previewId: str(data, "previewId") });
    await commitMemberImport({
      actor,
      previewId: loaded.previewId,
      filename: loaded.filename,
      preview: loaded.preview,
      ip,
    });
  });
}

export async function adminBulkRejectAction(formData: FormData): Promise<Result> {
  return runAdminAction(
    formData,
    ["/admin/activities", "/admin/attendance"],
    async ({ actor, ip }, data) => {
      await decideAttendance({
        actor,
        attendanceIds: strs(data, "attendanceIds"),
        to: "REJECTED",
        ip,
      });
    }
  );
}

export async function adminPublishProposalAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    const activity = await publishProposedActivity({
      actor,
      activityId: str(data, "activityId"),
      ip,
    });
    dispatchAppEvent({ type: "ACTIVITY_OPENED", activityName: activity.name });
  });
}

export async function adminRejectProposalAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await rejectProposedActivity({
      actor,
      activityId: str(data, "activityId"),
      ip,
    });
  });
}

export async function adminRotateAttendanceTokenAction(formData: FormData) {
  try {
    const actor = requireAdmin(await getCurrentActor());
    const ip = await clientIp();
    const result = await rotateAttendanceToken({
      actor,
      activityId: str(formData, "activityId"),
      ip,
    });
    revalidatePath("/admin/activities");
    return { ok: true as const, token: result.token, publicId: result.activity.publicId };
  } catch (error) {
    return { ok: false as const, message: toUserMessage(error) };
  }
}

export async function adminDisableAttendanceTokenAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/activities"], async ({ actor, ip }, data) => {
    await disableAttendanceToken({
      actor,
      activityId: str(data, "activityId"),
      ip,
    });
  });
}

export async function adminPreviewFormsImportAction(formData: FormData) {
  try {
    const actor = requireAdmin(await getCurrentActor());
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false as const, message: "Adjunta un archivo CSV o XLSX." };
    }
    const buffer = await file.arrayBuffer();
    const rows = parseTabular(buffer, file.name, "FORMS");
    const preview = await previewFormsImport(rows);
    const previewId = await saveFormsImportPreview({
      actor,
      filename: file.name,
      preview,
    });
    return {
      ok: true as const,
      previewId,
      filename: file.name,
      valid: preview.valid.length,
      warnings: preview.warnings,
      errors: preview.errors,
    };
  } catch (error) {
    return { ok: false as const, message: toUserMessage(error) };
  }
}

export async function adminCommitFormsImportAction(formData: FormData): Promise<Result> {
  return runAdminAction(formData, ["/admin/attendance", "/admin/imports"], async ({ actor, ip }, data) => {
    const loaded = await loadFormsImportPreview({ actor, previewId: str(data, "previewId") });
    if (loaded.preview.errors.length > 0) {
      throw new DomainError(
        ErrorCodes.IMPORT_INVALID,
        "No se puede importar un archivo con errores.",
        400
      );
    }
    await commitFormsImport({
      actor,
      previewId: loaded.previewId,
      filename: loaded.filename,
      rows: loaded.preview.valid,
      ip,
    });
  });
}
