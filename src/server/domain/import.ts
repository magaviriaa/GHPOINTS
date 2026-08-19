import "server-only";

import { z } from "zod";
import type { AttendanceSource, MemberType, Prisma } from "@prisma/client";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/server/db/prisma";
import { normalizeEmail, isAllowedEmailDomain } from "@/server/auth/email";
import { getAllowedEmailDomains } from "@/server/config/env";
import { DomainError, ErrorCodes } from "@/server/domain/errors";
import { writeAuditLog } from "@/server/domain/audit";
import { isUniqueConstraint } from "@/server/db/errors";
import { syncAttendanceCredit } from "@/server/domain/attendance-credit";
import { recomputeActivityScores } from "@/server/domain/scoring";
import { slugify } from "@/lib/text";
import type { Actor } from "@/server/domain/authorization";
import { requireAdmin } from "@/server/domain/authorization";

export type ImportKind = "MEMBERS" | "FORMS";

export type ImportIssue = { row: number; message: string; level: "error" | "warning" };

export type MemberImportRow = {
  row: number;
  fullName: string;
  email: string;
  memberType: MemberType;
  committeeSlugs: string[];
};

export type MemberImportPreview = {
  valid: MemberImportRow[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
};

const importIssueSchema = z.object({
  row: z.number(),
  message: z.string(),
  level: z.enum(["error", "warning"]),
});

const memberImportRowSchema = z.object({
  row: z.number(),
  fullName: z.string(),
  email: z.string(),
  memberType: z.enum(["NEW", "ACTIVE"]),
  committeeSlugs: z.array(z.string()),
});

const memberImportPreviewSchema = z.object({
  valid: z.array(memberImportRowSchema),
  warnings: z.array(importIssueSchema),
  errors: z.array(importIssueSchema),
});

export const formsJsonRowSchema = z
  .object({
    email: z.string().email(),
    activityKey: z.string().min(1),
    registeredAt: z.string().datetime().optional(),
  })
  .strict();

export const formsJsonBodySchema = z
  .object({
    rows: z.array(formsJsonRowSchema).min(1),
  })
  .strict();

type ImportColumn = {
  field: string;
  aliases: string[];
  required: boolean;
};

const MEMBER_IMPORT_COLUMNS: ImportColumn[] = [
  { field: "fullName", aliases: ["nombre", "name", "full_name", "full name"], required: true },
  { field: "email", aliases: ["correo", "email", "mail", "correo institucional"], required: true },
  { field: "memberTypeLabel", aliases: ["tipo", "type", "member_type"], required: false },
  {
    field: "committeeLabel",
    aliases: ["comites", "comités", "committees", "committee"],
    required: false,
  },
];

const FORMS_IMPORT_COLUMNS: ImportColumn[] = [
  { field: "email", aliases: ["email", "correo", "mail"], required: true },
  {
    field: "activityKey",
    aliases: ["activitykey", "activity_key", "actividad", "activity"],
    required: true,
  },
  {
    field: "registeredAtLabel",
    aliases: ["registeredat", "registered_at", "fecha"],
    required: false,
  },
];

export type MemberSpreadsheetRow = {
  fullName: string;
  email: string;
  memberTypeLabel: string;
  committeeLabel: string;
};

export type FormsSpreadsheetRow = {
  email: string;
  activityKey: string;
  registeredAtLabel: string;
};

function columnsFor(kind: ImportKind): ImportColumn[] {
  switch (kind) {
    case "MEMBERS":
      return MEMBER_IMPORT_COLUMNS;
    case "FORMS":
      return FORMS_IMPORT_COLUMNS;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function normalizeHeader(value: string): string {
  return value.replace(/^\ufeff/, "").trim().toLowerCase();
}

function aliasToField(columns: ImportColumn[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const column of columns) {
    for (const alias of column.aliases) {
      map.set(normalizeHeader(alias), column.field);
    }
  }
  return map;
}

function headerIndex(kind: ImportKind, headers: string[]): Map<string, number> {
  const columns = columnsFor(kind);
  const aliases = aliasToField(columns);
  const index = new Map<string, number>();

  headers.forEach((header, position) => {
    const normalized = normalizeHeader(header);
    if (normalized.length === 0) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        "Hay un encabezado vacío en el archivo.",
        400
      );
    }
    const field = aliases.get(normalized);
    if (field === undefined) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `Columna no reconocida: ${header.trim()}.`,
        400
      );
    }
    if (index.has(field)) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `La columna ${field} está duplicada.`,
        400
      );
    }
    index.set(field, position);
  });

  for (const column of columns) {
    if (column.required && !index.has(column.field)) {
      throw new DomainError(
        ErrorCodes.VALIDATION,
        `Falta la columna obligatoria: ${column.aliases[0]}.`,
        400
      );
    }
  }

  return index;
}

function cell(row: string[], index: Map<string, number>, field: string): string {
  const position = index.get(field);
  if (position === undefined) return "";
  return String(row[position] ?? "").trim();
}

type SpreadsheetTable = {
  headers: string[];
  rows: string[][];
};

function parseSpreadsheet(buffer: ArrayBuffer, filename: string): SpreadsheetTable {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder().decode(buffer);
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
    });
    const [headerRow, ...dataRows] = parsed.data;
    if (!headerRow || headerRow.length === 0) {
      throw new DomainError(ErrorCodes.VALIDATION, "El archivo no tiene encabezados.", 400);
    }
    return {
      headers: headerRow.map((value) => String(value ?? "")),
      rows: dataRows.map((row) => headerRow.map((_, position) => String(row[position] ?? ""))),
    };
  }

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) {
    throw new DomainError(ErrorCodes.VALIDATION, "El archivo no tiene hojas.", 400);
  }
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const [headerRow, ...dataRows] = matrix;
  if (!headerRow || headerRow.length === 0) {
    throw new DomainError(ErrorCodes.VALIDATION, "El archivo no tiene encabezados.", 400);
  }
  return {
    headers: headerRow.map((value) => String(value ?? "")),
    rows: dataRows.map((row) => headerRow.map((_, position) => String(row[position] ?? ""))),
  };
}

export function parseTabular(
  buffer: ArrayBuffer,
  filename: string,
  kind: "MEMBERS"
): MemberSpreadsheetRow[];
export function parseTabular(
  buffer: ArrayBuffer,
  filename: string,
  kind: "FORMS"
): FormsSpreadsheetRow[];
export function parseTabular(
  buffer: ArrayBuffer,
  filename: string,
  kind: ImportKind
): MemberSpreadsheetRow[] | FormsSpreadsheetRow[] {
  const spreadsheet = parseSpreadsheet(buffer, filename);
  const index = headerIndex(kind, spreadsheet.headers);

  switch (kind) {
    case "MEMBERS":
      return spreadsheet.rows.map((row) => ({
        fullName: cell(row, index, "fullName"),
        email: cell(row, index, "email"),
        memberTypeLabel: cell(row, index, "memberTypeLabel"),
        committeeLabel: cell(row, index, "committeeLabel"),
      }));
    case "FORMS":
      return spreadsheet.rows.map((row) => ({
        email: cell(row, index, "email"),
        activityKey: cell(row, index, "activityKey"),
        registeredAtLabel: cell(row, index, "registeredAtLabel"),
      }));
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function parseMemberType(value: string | undefined): MemberType | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (raw === "new" || raw === "nuevo" || raw === "nueva") return "NEW";
  if (raw === "active" || raw === "activo" || raw === "activa") return "ACTIVE";
  return null;
}

function splitCommittees(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map((item) => slugify(item.trim()))
    .filter(Boolean);
}

export async function previewMemberImport(
  rows: MemberSpreadsheetRow[]
): Promise<MemberImportPreview> {
  const domains = getAllowedEmailDomains();
  const committees = await prisma.committee.findMany();
  const bySlug = new Map(committees.map((committee) => [committee.slug, committee]));
  const byName = new Map(committees.map((committee) => [slugify(committee.name), committee]));

  const valid: MemberImportRow[] = [];
  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];
  const seenEmails = new Set<string>();

  rows.forEach((raw, index) => {
    const row = index + 2;
    const fullName = raw.fullName.trim();
    const email = normalizeEmail(raw.email);
    const typeLabel = raw.memberTypeLabel;
    const committeeLabel = raw.committeeLabel;

    if (!fullName && !email) return;

    if (!fullName) {
      errors.push({ row, level: "error", message: "Falta el nombre." });
      return;
    }
    if (!email || !email.includes("@")) {
      errors.push({ row, level: "error", message: "Falta un correo válido." });
      return;
    }
    if (!isAllowedEmailDomain(email, domains)) {
      errors.push({ row, level: "error", message: `Dominio no permitido: ${email}` });
      return;
    }
    if (seenEmails.has(email)) {
      errors.push({ row, level: "error", message: `Correo duplicado en el archivo: ${email}` });
      return;
    }
    seenEmails.add(email);

    const memberType = parseMemberType(typeLabel) ?? "NEW";
    if (!parseMemberType(typeLabel)) {
      warnings.push({
        row,
        level: "warning",
        message: `Tipo no reconocido para ${email}; se usará NEW.`,
      });
    }

    const committeeSlugs: string[] = [];
    for (const token of splitCommittees(committeeLabel)) {
      const committee = bySlug.get(token) || byName.get(token);
      if (!committee) {
        errors.push({ row, level: "error", message: `Comité desconocido: ${token}` });
        continue;
      }
      committeeSlugs.push(committee.slug);
    }

    valid.push({ row, fullName, email, memberType, committeeSlugs });
  });

  return { valid, warnings, errors };
}

function parseMemberImportPreview(value: Prisma.JsonValue | null): MemberImportPreview | null {
  const parsed = memberImportPreviewSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function saveMemberImportPreview(input: {
  actor: Actor;
  filename: string;
  preview: MemberImportPreview;
}) {
  requireAdmin(input.actor);
  const job = await prisma.importJob.create({
    data: {
      type: "MEMBERS",
      status: "PREVIEWED",
      filename: input.filename,
      createdById: input.actor.id,
      summary: {
        valid: input.preview.valid,
        warnings: input.preview.warnings,
        errors: input.preview.errors,
      },
    },
  });
  return job.id;
}

export async function loadMemberImportPreview(input: { actor: Actor; previewId: string }) {
  requireAdmin(input.actor);
  const job = await prisma.importJob.findFirst({
    where: {
      id: input.previewId,
      createdById: input.actor.id,
      type: "MEMBERS",
      status: "PREVIEWED",
    },
  });
  if (!job) {
    throw new DomainError(
      ErrorCodes.NOT_FOUND,
      "La vista previa expiró. Vuelve a cargar el archivo.",
      404
    );
  }
  const preview = parseMemberImportPreview(job.summary);
  if (!preview) {
    throw new DomainError(
      ErrorCodes.IMPORT_INVALID,
      "La vista previa está corrupta. Vuelve a cargar el archivo.",
      400
    );
  }
  return { previewId: job.id, filename: job.filename, preview };
}

export async function consumeMemberImportPreview(previewId: string) {
  await prisma.importJob.update({
    where: { id: previewId },
    data: { status: "CONSUMED" },
  });
}

export async function commitMemberImport(input: {
  actor: Actor;
  filename: string;
  preview: MemberImportPreview;
  ip?: string | null;
}) {
  requireAdmin(input.actor);
  if (input.preview.errors.length > 0) {
    throw new DomainError(
      ErrorCodes.IMPORT_INVALID,
      "No se puede importar un archivo con errores.",
      400
    );
  }

  const committees = await prisma.committee.findMany();
  const bySlug = new Map(committees.map((committee) => [committee.slug, committee]));

  await prisma.$transaction(async (tx) => {
    for (const row of input.preview.valid) {
      const existing = await tx.member.findUnique({
        where: { institutionalEmail: row.email },
        include: { committees: true },
      });

      const member =
        existing ??
        (await tx.member.create({
          data: {
            fullName: row.fullName,
            institutionalEmail: row.email,
            memberType: row.memberType,
            roles: { create: { role: "MEMBER" } },
          },
        }));

      if (existing) {
        await tx.member.update({
          where: { id: existing.id },
          data: { fullName: row.fullName, memberType: row.memberType },
        });
      }

      for (const slug of row.committeeSlugs) {
        const committee = bySlug.get(slug);
        if (!committee) continue;
        const active = (existing?.committees ?? []).find(
          (item) => item.committeeId === committee.id && item.isActive
        );
        if (active) continue;
        await tx.memberCommittee.create({
          data: { memberId: member.id, committeeId: committee.id },
        });
      }
    }

    await tx.importJob.create({
      data: {
        type: "MEMBERS",
        status: "COMMITTED",
        filename: input.filename,
        createdById: input.actor.id,
        summary: {
          valid: input.preview.valid.length,
          warnings: input.preview.warnings.length,
          errors: 0,
        },
      },
    });
  });

  await writeAuditLog({
    actorId: input.actor.id,
    action: "MEMBERS_IMPORTED",
    entityType: "ImportJob",
    entityId: "members",
    after: { filename: input.filename, count: input.preview.valid.length },
    ip: input.ip,
  });
}

export type FormsImportRow = {
  email: string;
  activityKey: string;
  registeredAt?: Date;
};

type FormsImportResult = {
  created: number;
  skipped: number;
  errors: string[];
};

export async function importFormsAttendances(input: {
  actor?: Actor | null;
  rows: FormsImportRow[];
  source?: AttendanceSource;
}) {
  const results: FormsImportResult = {
    created: 0,
    skipped: 0,
    errors: [],
  };
  const touchedActivityIds = new Set<string>();

  for (const row of input.rows) {
    const email = normalizeEmail(row.email);
    const member = await prisma.member.findUnique({ where: { institutionalEmail: email } });
    if (!member) {
      results.errors.push(`Integrante no encontrado: ${email}`);
      continue;
    }

    const activity = await prisma.activity.findFirst({
      where: {
        OR: [{ publicId: row.activityKey }, { name: row.activityKey }, { id: row.activityKey }],
      },
    });
    if (!activity) {
      results.errors.push(`Actividad no encontrada: ${row.activityKey}`);
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const attendance = await tx.attendance.create({
          data: {
            activityId: activity.id,
            memberId: member.id,
            status: "APPROVED",
            registeredAt: row.registeredAt ?? new Date(),
            approvedAt: new Date(),
            source: input.source ?? "MICROSOFT_FORMS",
          },
        });
        await syncAttendanceCredit(tx, {
          attendanceId: attendance.id,
          memberId: member.id,
          activity,
          status: "APPROVED",
          createdById: input.actor?.id ?? null,
        });
      });
      touchedActivityIds.add(activity.id);
      results.created += 1;
    } catch (error) {
      if (isUniqueConstraint(error)) {
        results.skipped += 1;
        continue;
      }
      results.errors.push(`No se pudo importar ${email}.`);
    }
  }

  for (const activityId of touchedActivityIds) {
    await recomputeActivityScores(activityId);
  }

  return results;
}

export type FormsImportPreview = {
  valid: FormsImportRow[];
  warnings: ImportIssue[];
  errors: ImportIssue[];
};

const formsImportRowStoredSchema = z.object({
  email: z.string(),
  activityKey: z.string(),
  registeredAt: z.string().datetime().optional(),
});

const formsImportPreviewSchema = z.object({
  valid: z.array(formsImportRowStoredSchema),
  warnings: z.array(importIssueSchema),
  errors: z.array(importIssueSchema),
});

export async function previewFormsImport(rows: FormsSpreadsheetRow[]): Promise<FormsImportPreview> {
  const valid: FormsImportRow[] = [];
  const warnings: ImportIssue[] = [];
  const errors: ImportIssue[] = [];

  rows.forEach((raw, index) => {
    const row = index + 2;
    const email = normalizeEmail(raw.email);
    const activityKey = raw.activityKey.trim();
    if (!email && !activityKey) return;
    if (!email.includes("@")) {
      errors.push({ row, level: "error", message: "Falta un correo válido." });
      return;
    }
    if (!activityKey) {
      errors.push({ row, level: "error", message: "Falta la actividad." });
      return;
    }
    let registeredAt: Date | undefined;
    if (raw.registeredAtLabel.trim()) {
      const parsed = new Date(raw.registeredAtLabel);
      if (Number.isNaN(parsed.getTime())) {
        warnings.push({
          row,
          level: "warning",
          message: `Fecha no reconocida en fila ${row}; se usará ahora.`,
        });
      } else {
        registeredAt = parsed;
      }
    }
    valid.push({ email, activityKey, registeredAt });
  });

  return { valid, warnings, errors };
}

function parseFormsImportPreview(value: Prisma.JsonValue | null): FormsImportPreview | null {
  const parsed = formsImportPreviewSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    valid: parsed.data.valid.map((row) => ({
      email: row.email,
      activityKey: row.activityKey,
      registeredAt: row.registeredAt ? new Date(row.registeredAt) : undefined,
    })),
    warnings: parsed.data.warnings,
    errors: parsed.data.errors,
  };
}

function serializeFormsPreview(preview: FormsImportPreview) {
  return {
    valid: preview.valid.map((row) => ({
      email: row.email,
      activityKey: row.activityKey,
      registeredAt: row.registeredAt?.toISOString(),
    })),
    warnings: preview.warnings,
    errors: preview.errors,
  };
}

export async function saveFormsImportPreview(input: {
  actor: Actor;
  filename: string;
  preview: FormsImportPreview;
}) {
  requireAdmin(input.actor);
  const job = await prisma.importJob.create({
    data: {
      type: "FORMS",
      status: "PREVIEWED",
      filename: input.filename,
      createdById: input.actor.id,
      summary: serializeFormsPreview(input.preview),
    },
  });
  return job.id;
}

export async function loadFormsImportPreview(input: { actor: Actor; previewId: string }) {
  requireAdmin(input.actor);
  const job = await prisma.importJob.findFirst({
    where: {
      id: input.previewId,
      createdById: input.actor.id,
      type: "FORMS",
      status: "PREVIEWED",
    },
  });
  if (!job) {
    throw new DomainError(
      ErrorCodes.NOT_FOUND,
      "La vista previa expiró. Vuelve a cargar el archivo.",
      404
    );
  }
  const preview = parseFormsImportPreview(job.summary);
  if (!preview) {
    throw new DomainError(
      ErrorCodes.IMPORT_INVALID,
      "La vista previa está corrupta. Vuelve a cargar el archivo.",
      400
    );
  }
  return { previewId: job.id, filename: job.filename, preview };
}
