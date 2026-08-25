/** ISO-8601 instant for timestamptz string columns. */
export function isoNow(at: Date = new Date()): string {
  return at.toISOString();
}

export function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Instant comparison — do not lexicographically compare timestamptz strings. */
export function isPast(value: string | Date, at: Date = new Date()): boolean {
  return toDate(value).getTime() < at.getTime();
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Calendar date `YYYY-MM-DD` for date columns. */
export function toDateOnly(value: Date | string): string {
  if (!(value instanceof Date) && CALENDAR_DATE.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toDecimal(value: number): string {
  return value.toFixed(6);
}

export function fromDecimal(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}
