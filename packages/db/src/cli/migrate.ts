// pnpm db:migrate — applies pending migrations to DATABASE_URL and seeds default settings.
import { createPool } from '../client';
import { prepareDatabase } from '../migrate';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const pool = createPool(connectionString, { max: 1, applicationName: 'wx-migrate' });
try {
  await prepareDatabase(pool);
  console.log('Database is up to date.');
} finally {
  await pool.end();
}
