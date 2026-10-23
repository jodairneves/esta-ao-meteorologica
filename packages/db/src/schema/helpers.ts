import { type SQL, sql } from 'drizzle-orm';
import { type AnyPgColumn, timestamp } from 'drizzle-orm/pg-core';

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();
export const updatedAt = () => timestamptz('updated_at').notNull().defaultNow();

/** `column IN (...)` for CHECK constraints built from the closed sets in @wx/shared. */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value.replaceAll("'", "''")}'`).join(', ');
  return sql`${column} in (${sql.raw(list)})`;
}
