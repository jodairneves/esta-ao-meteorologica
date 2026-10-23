import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
export type DbPool = pg.Pool;
/** A database handle or an open transaction (both run queries the same way). */
export type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface PoolOptions {
  max?: number;
  applicationName?: string;
  /** Server-side limit for each statement, so a stuck query cannot block a service forever. */
  statementTimeoutMs?: number;
  /** Errors on idle clients (e.g. the server restarted). Without a handler they crash the process. */
  onError?: (error: Error) => void;
}

export function createPool(connectionString: string, options: PoolOptions = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName,
    statement_timeout: options.statementTimeoutMs,
    keepAlive: true,
  });
  pool.on('error', options.onError ?? ((error) => console.error('[db] idle client error', error)));
  return pool;
}

export function createDb(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema });
}
