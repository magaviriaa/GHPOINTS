import "server-only";

import { getEnv, getTeamsWebhookUrl } from "@/server/config/env";
import { getEmailSender, type EmailMessage } from "@/server/email/sender";
import { escapeHtml } from "@/lib/text";

export type AttendanceNotifyStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AppNotification =
  | {
      type: "ATTENDANCE_REGISTERED";
      memberEmail: string;
      memberName: string;
      activityName: string;
      status: AttendanceNotifyStatus;
      points: number;
    }
  | {
      type: "ATTENDANCE_APPROVED";
      memberEmail: string;
      memberName: string;
      activityName: string;
      points: number;
    }
  | {
      type: "ACTIVITY_OPENED";
      activityName: string;
    };

export function dispatchAppEvent(event: AppNotification): void {
  void deliver(event).catch(() => {
    console.error("[notify] delivery failed");
  });
}

async function deliver(event: AppNotification): Promise<void> {
  await Promise.all([sendEmailFor(event), sendTeamsFor(event)]);
}

async function sendEmailFor(event: AppNotification): Promise<void> {
  const message = emailFor(event);
  if (!message) return;
  await getEmailSender().send(message);
}

function emailFor(event: AppNotification): EmailMessage | null {
  switch (event.type) {
    case "ATTENDANCE_REGISTERED": {
      const approved = event.status === "APPROVED";
      return {
        to: event.memberEmail,
        subject: approved
          ? `Asistencia acreditada: ${event.activityName}`
          : `Asistencia registrada: ${event.activityName}`,
        text: approved
          ? `Hola ${event.memberName}, tu asistencia a ${event.activityName} quedó acreditada (+${event.points} GH Points).`
          : `Hola ${event.memberName}, registramos tu asistencia a ${event.activityName}. Quedó pendiente de aprobación.`,
        html: approved
          ? `<p>Hola ${escapeHtml(event.memberName)}, tu asistencia a <strong>${escapeHtml(event.activityName)}</strong> quedó acreditada (+${event.points} GH Points).</p>`
          : `<p>Hola ${escapeHtml(event.memberName)}, registramos tu asistencia a <strong>${escapeHtml(event.activityName)}</strong>. Quedó pendiente de aprobación.</p>`,
      };
    }
    case "ATTENDANCE_APPROVED":
      return {
        to: event.memberEmail,
        subject: `Asistencia aprobada: ${event.activityName}`,
        text: `Hola ${event.memberName}, aprobaron tu asistencia a ${event.activityName}. +${event.points} GH Points.`,
        html: `<p>Hola ${escapeHtml(event.memberName)}, aprobaron tu asistencia a <strong>${escapeHtml(event.activityName)}</strong>. +${event.points} GH Points.</p>`,
      };
    case "ACTIVITY_OPENED":
      return null;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

async function sendTeamsFor(event: AppNotification): Promise<void> {
  const webhook = getTeamsWebhookUrl();
  if (!webhook) return;
  const text = teamsText(event);
  if (!text) return;
  const response = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    throw new Error(`Teams webhook ${response.status}`);
  }
}

function teamsText(event: AppNotification): string | null {
  const env = getEnv();
  switch (event.type) {
    case "ATTENDANCE_REGISTERED":
      return `Nueva asistencia en GH Points: ${event.memberName} → ${event.activityName} (${event.status}). ${env.APP_URL}`;
    case "ATTENDANCE_APPROVED":
      return `Asistencia aprobada: ${event.memberName} → ${event.activityName} (+${event.points}).`;
    case "ACTIVITY_OPENED":
      return `Actividad abierta: ${event.activityName}. ${env.APP_URL}`;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
