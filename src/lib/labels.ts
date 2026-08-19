/**
 * Los enums de Prisma son cómo está construido el sistema; esto es cómo lo
 * nombra la persona que lo usa. Fuente única: badges de estado, `<option>` de
 * administración y exportaciones leen de aquí, para que un mismo estado se
 * llame igual en toda la app.
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "muted";

export type LabelEntry = { label: string; tone: Tone; hint?: string };

function entries<T extends Record<string, LabelEntry>>(value: T): T {
  return value;
}

export const ACTIVITY_STATUS = entries({
  DRAFT: { label: "Borrador", tone: "muted", hint: "Todavía no se puede registrar" },
  OPEN: { label: "Abierta", tone: "success", hint: "El registro está abierto" },
  CLOSED: { label: "Cerrada", tone: "neutral", hint: "Ya no admite registros" },
  PROCESSED: { label: "Procesada", tone: "info", hint: "Score de comité calculado" },
  CANCELLED: { label: "Cancelada", tone: "danger" },
});

export const ATTENDANCE_STATUS = entries({
  PENDING: { label: "Pendiente", tone: "warning", hint: "Falta que un admin la apruebe" },
  APPROVED: { label: "Aprobada", tone: "success" },
  REJECTED: { label: "Rechazada", tone: "danger" },
  CANCELLED: { label: "Anulada", tone: "muted" },
});

export const MEMBER_TYPE = entries({
  NEW: { label: "Nuevo", tone: "info" },
  ACTIVE: { label: "Activo", tone: "neutral" },
});

/**
 * «Vigente/Retirado», no «Activo/Inactivo»: el tipo de integrante ya usa
 * «Activo» para el tablero de veteranos, y dos chips que dicen lo mismo en la
 * misma fila no distinguen nada.
 */
export const MEMBER_STATUS = entries({
  ACTIVE: { label: "Vigente", tone: "success" },
  INACTIVE: { label: "Retirado", tone: "muted" },
});

export const SEASON_STATUS = entries({
  UPCOMING: { label: "Próxima", tone: "info" },
  ACTIVE: { label: "En curso", tone: "success" },
  CLOSED: { label: "Cerrada", tone: "muted" },
});

export const POINT_TRANSACTION_TYPE = entries({
  ACTIVITY: { label: "Asistencia", tone: "neutral" },
  MANUAL_ADJUSTMENT: { label: "Ajuste manual", tone: "info" },
  BONUS: { label: "Bono", tone: "success" },
  PENALTY: { label: "Descuento", tone: "danger" },
  REVERSAL: { label: "Reversión", tone: "warning" },
});

export const ATTENDANCE_SOURCE = entries({
  QR: { label: "QR", tone: "neutral" },
  LINK: { label: "Enlace", tone: "neutral" },
  ADMIN: { label: "Registro manual", tone: "info" },
  IMPORT: { label: "Importación", tone: "info" },
  MICROSOFT_FORMS: { label: "Microsoft Forms", tone: "muted" },
});

export const APPROVAL_MODE = entries({
  AUTO: { label: "Automática", tone: "success", hint: "Los puntos se acreditan al registrar" },
  MANUAL: { label: "Manual", tone: "warning", hint: "Un admin revisa cada registro" },
});

export const ROLE_CODE = entries({
  MEMBER: { label: "Integrante", tone: "neutral" },
  COMMITTEE_LEADER: { label: "Líder de comité", tone: "info" },
  ADMIN: { label: "GH General", tone: "info" },
});

export const COMMITTEE_STATUS = entries({
  ACTIVE: { label: "Activo", tone: "success" },
  INACTIVE: { label: "Inactivo", tone: "muted" },
});

export const CREDIT_STRATEGY = entries({
  FULL_CREDIT: {
    label: "Crédito completo",
    tone: "neutral",
    hint: "Quien está en varios comités suma en todos. Replica el flujo de Forms.",
  },
  FRACTIONAL_CREDIT: {
    label: "Crédito repartido",
    tone: "neutral",
    hint: "La asistencia se divide entre los comités de la persona.",
  },
});

const FALLBACK: LabelEntry = { label: "—", tone: "muted" };

/** Traduce un valor de enum; si llega uno desconocido, no rompe la página. */
export function labelOf(
  dictionary: Record<string, LabelEntry>,
  value: string | null | undefined
): LabelEntry {
  if (!value) return FALLBACK;
  return dictionary[value] ?? { label: value, tone: "muted" };
}

/** Para poblar `<select>` sin repetir la lista en cada página. */
export function optionsOf(dictionary: Record<string, LabelEntry>) {
  return Object.entries(dictionary).map(([value, entry]) => ({
    value,
    label: entry.label,
    hint: entry.hint,
  }));
}
