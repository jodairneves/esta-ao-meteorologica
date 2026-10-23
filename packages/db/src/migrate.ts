import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type pg from 'pg';
import { createDb } from './client';
import { ensureDefaultSettings } from './settings';

/** Advisory lock shared by every service that runs migrations, so they never run concurrently. */
const MIGRATION_LOCK_ID = 7_220_224_101;

/**
 * Migrations folder when running from source. Bundled apps must pass their own path
 * (the folder is copied into the image), since import.meta.url then points at the bundle.
 */
export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

export async function runMigrations(
  pool: pg.Pool,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    try {
      await migrate(drizzle({ client }), { migrationsFolder });
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

/** Applies pending migrations and inserts missing default settings. Safe to call on every start. */
export async function prepareDatabase(
  pool: pg.Pool,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Promise<void> {
  await runMigrations(pool, migrationsFolder);
  await ensureDefaultSettings(createDb(pool));
}
