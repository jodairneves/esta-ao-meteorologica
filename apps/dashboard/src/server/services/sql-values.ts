// drizzle's node-postgres driver returns timestamptz columns of raw `db.execute()` queries as
// text ("2026-10-23 03:15:08.123456+00"). Typed queries are mapped by drizzle; raw ones are not.

/** Postgres timestamptz text (or a Date) to Date. */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const iso = String(value)
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const toIso = (value: unknown): string | null => toDate(value)?.toISOString() ?? null;
