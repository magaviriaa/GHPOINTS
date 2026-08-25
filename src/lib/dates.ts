import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { es } from "date-fns/locale";

export const DEFAULT_TIMEZONE = "America/Bogota";

/** Instant from the database: timestamptz ISO string or a `Date`. */
export type Instant = Date | string;

function asDate(value: Instant): Date {
  return value instanceof Date ? value : new Date(value);
}

function isDateOnly(value: Instant): value is string {
  return !(value instanceof Date) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
}

export function nowUtc(): Date {
  return new Date();
}

export function fromLocalInput(localDatetime: string, timeZone = getAppTimezone()): Date {
  const normalized = localDatetime.length === 16 ? `${localDatetime}:00` : localDatetime;
  return fromZonedTime(normalized, timeZone);
}

export function toLocalInput(date: Instant, timeZone = getAppTimezone()): string {
  const zoned = toZonedTime(asDate(date), timeZone);
  return format(zoned, "yyyy-MM-dd'T'HH:mm");
}

export function formatDateTime(
  date: Instant,
  timeZone = getAppTimezone(),
  pattern = "d MMM yyyy · h:mm a"
): string {
  const zoned = toZonedTime(asDate(date), timeZone);
  return format(zoned, pattern, { locale: es });
}

export function formatDate(
  date: Instant,
  timeZone = getAppTimezone(),
  pattern = "d MMM yyyy"
): string {
  if (isDateOnly(date)) {
    const [year, month, day] = date.split("-").map(Number);
    return format(new Date(year, month - 1, day), pattern, { locale: es });
  }
  const zoned = toZonedTime(asDate(date), timeZone);
  return format(zoned, pattern, { locale: es });
}

export function startOfWeekUtc(reference: Date, timeZone = getAppTimezone()): Date {
  const zoned = toZonedTime(reference, timeZone);
  const day = zoned.getDay();
  const diff = day === 0 ? 6 : day - 1;
  zoned.setHours(0, 0, 0, 0);
  zoned.setDate(zoned.getDate() - diff);
  return fromZonedTime(zoned, timeZone);
}

export function startOfMonthUtc(reference: Date, timeZone = getAppTimezone()): Date {
  const zoned = toZonedTime(reference, timeZone);
  zoned.setDate(1);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, timeZone);
}

export function isoWeekId(date: Date, timeZone = getAppTimezone()): string {
  const zoned = toZonedTime(date, timeZone);
  const week = getISOWeek(zoned);
  const year = getISOWeekYear(zoned);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseIsoWeekId(value: string): { year: number; week: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  if (week < 1 || week > 53) return null;
  return { year, week };
}

export function rangeForIsoWeek(
  isoWeek: string,
  timeZone = getAppTimezone()
): { start: Date; end: Date } | null {
  const parsed = parseIsoWeekId(isoWeek);
  if (!parsed) return null;
  const week1Anchor = fromZonedTime(`${parsed.year}-01-04T12:00:00`, timeZone);
  const zoned = toZonedTime(week1Anchor, timeZone);
  const deltaWeeks = parsed.week - getISOWeek(zoned);
  zoned.setDate(zoned.getDate() + deltaWeeks * 7);
  const day = zoned.getDay();
  const diff = day === 0 ? 6 : day - 1;
  zoned.setHours(0, 0, 0, 0);
  zoned.setDate(zoned.getDate() - diff);
  if (getISOWeek(zoned) !== parsed.week || getISOWeekYear(zoned) !== parsed.year) {
    return null;
  }
  const start = fromZonedTime(zoned, timeZone);
  const endZoned = new Date(zoned);
  endZoned.setDate(endZoned.getDate() + 7);
  return { start, end: fromZonedTime(endZoned, timeZone) };
}

export function recentIsoWeekIds(
  count: number,
  reference = new Date(),
  timeZone = getAppTimezone()
): string[] {
  const ids: string[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const cursor = new Date(reference.getTime() - offset * 7 * 24 * 60 * 60 * 1000);
    const id = isoWeekId(cursor, timeZone);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function yearMonthKey(date: Date, timeZone = getAppTimezone()): string {
  return format(toZonedTime(date, timeZone), "yyyy-MM");
}

export function rangeForYearMonth(
  yearMonth: string,
  timeZone = getAppTimezone()
): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const start = fromZonedTime(
    `${year}-${String(month).padStart(2, "0")}-01T00:00:00`,
    timeZone
  );
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = fromZonedTime(
    `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`,
    timeZone
  );
  return { start, end };
}
