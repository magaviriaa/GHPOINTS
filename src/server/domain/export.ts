import "server-only";

import Papa from "papaparse";
import * as XLSX from "xlsx";
import { prisma } from "@/server/db/prisma";
import { resolveSeason } from "@/server/domain/season";
import { getCommitteeRanking, getIndividualRanking } from "@/server/domain/ranking";

export type ExportScalar = string | number | boolean | null;
export type ExportRow = Record<string, ExportScalar>;
export type ExportFormat = "csv" | "xlsx";

/**
 * Spreadsheet apps evaluate a cell that opens with `=`, `+`, `-` or `@`.
 * Names and committee lists reach this module from CSV import, so every text
 * cell is neutralised with a leading apostrophe before it is serialised.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function isTextCell(value: ExportScalar): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ExportScalar narrowing at the file boundary
  return typeof value === "string";
}

export function escapeSpreadsheetCell(value: ExportScalar): ExportScalar {
  if (!isTextCell(value)) return value;
  return FORMULA_START.test(value) ? `'${value}` : value;
}

function escapeRows(rows: ExportRow[]): ExportRow[] {
  return rows.map((row) => {
    const safe: ExportRow = {};
    for (const [key, value] of Object.entries(row)) {
      safe[key] = escapeSpreadsheetCell(value);
    }
    return safe;
  });
}

export function toCsv(rows: ExportRow[]): string {
  return Papa.unparse(escapeRows(rows));
}

export function toXlsx(rows: ExportRow[], sheetName: string): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(escapeRows(rows));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export const EXPORT_TYPES = ["members", "attendances", "points", "rankings", "activity"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export function parseExportType(value: string): ExportType | null {
  for (const option of EXPORT_TYPES) {
    if (option === value) return option;
  }
  return null;
}

export function parseExportFormat(value: string | null): ExportFormat {
  return value === "xlsx" ? "xlsx" : "csv";
}

async function memberRows(): Promise<ExportRow[]> {
  const members = await prisma.member.findMany({
    include: {
      committees: {
        where: { isActive: true },
        include: { committee: true },
      },
      roles: true,
    },
    orderBy: { fullName: "asc" },
  });
  return members.map((member) => ({
    nombre: member.fullName,
    correo: member.institutionalEmail,
    tipo: member.memberType,
    estado: member.status,
    roles: member.roles
      .map((role) => (role.role === "ADMIN" ? "GH General" : role.role))
      .join("; "),
    comites: member.committees.map((item) => item.committee.name).join("; "),
  }));
}

async function attendanceRows(activityId?: string): Promise<ExportRow[]> {
  const attendances = await prisma.attendance.findMany({
    where: activityId ? { activityId } : undefined,
    include: {
      member: true,
      activity: true,
    },
    orderBy: { registeredAt: "desc" },
  });
  return attendances.map((row) => ({
    actividad: row.activity.name,
    integrante: row.member.fullName,
    correo: row.member.institutionalEmail,
    estado: row.status,
    fuente: row.source,
    registrado: row.registeredAt.toISOString(),
  }));
}

async function pointRows(seasonId?: string): Promise<ExportRow[]> {
  const season = await resolveSeason(seasonId);
  const rows = await prisma.pointTransaction.findMany({
    where: { seasonId: season?.id },
    include: { member: true, activity: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    integrante: row.member.fullName,
    correo: row.member.institutionalEmail,
    puntos: row.points,
    tipo: row.type,
    motivo: row.reason,
    actividad: row.activity?.name ?? "",
    fecha: row.createdAt.toISOString(),
  }));
}

async function rankingRows(seasonId?: string): Promise<ExportRow[]> {
  const [active, newer, committees] = await Promise.all([
    getIndividualRanking({ board: "ACTIVE", seasonId }),
    getIndividualRanking({ board: "NEW", seasonId }),
    getCommitteeRanking(seasonId),
  ]);

  return [
    ...active.entries.map((entry) => ({
      tablero: "ACTIVE",
      puesto: entry.rank,
      nombre: entry.fullName,
      puntos: entry.total,
    })),
    ...newer.entries.map((entry) => ({
      tablero: "NEW",
      puesto: entry.rank,
      nombre: entry.fullName,
      puntos: entry.total,
    })),
    ...committees.entries.map((entry) => ({
      tablero: "COMMITTEE",
      puesto: entry.rank,
      nombre: entry.name,
      puntos: Number((entry.total * 100).toFixed(1)),
    })),
  ];
}

async function activityRows(activityId?: string): Promise<ExportRow[]> {
  if (!activityId) {
    const activities = await prisma.activity.findMany({
      include: {
        season: true,
        _count: { select: { attendances: true } },
      },
      orderBy: { startsAt: "desc" },
    });
    return activities.map((activity) => ({
      nombre: activity.name,
      publicId: activity.publicId,
      temporada: activity.season.name,
      estado: activity.status,
      puntos: activity.individualPoints,
      registros: activity._count.attendances,
      inicio: activity.startsAt.toISOString(),
    }));
  }

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { season: true },
  });
  if (!activity) return [];
  const attendances = await attendanceRows(activityId);
  return [
    {
      nombre: activity.name,
      publicId: activity.publicId,
      temporada: activity.season.name,
      estado: activity.status,
      puntos: activity.individualPoints,
      inicio: activity.startsAt.toISOString(),
    },
    ...attendances,
  ];
}

export async function exportRows(
  type: ExportType,
  filters: { activityId?: string; seasonId?: string }
): Promise<{ rows: ExportRow[]; filenameBase: string; sheetName: string }> {
  switch (type) {
    case "members":
      return { rows: await memberRows(), filenameBase: "integrantes", sheetName: "Integrantes" };
    case "attendances":
      return {
        rows: await attendanceRows(filters.activityId),
        filenameBase: "asistencias",
        sheetName: "Asistencias",
      };
    case "points":
      return {
        rows: await pointRows(filters.seasonId),
        filenameBase: "puntos",
        sheetName: "Puntos",
      };
    case "rankings":
      return {
        rows: await rankingRows(filters.seasonId),
        filenameBase: "rankings",
        sheetName: "Rankings",
      };
    case "activity":
      return {
        rows: await activityRows(filters.activityId),
        filenameBase: "actividad",
        sheetName: "Actividad",
      };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export async function exportMembersCsv() {
  return toCsv(await memberRows());
}

export async function exportAttendancesCsv(activityId?: string) {
  return toCsv(await attendanceRows(activityId));
}

export async function exportPointsCsv(seasonId?: string) {
  return toCsv(await pointRows(seasonId));
}

export async function exportRankingsCsv(seasonId?: string) {
  return toCsv(await rankingRows(seasonId));
}
