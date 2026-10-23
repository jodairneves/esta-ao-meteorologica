import { defineConfig } from 'drizzle-kit';

// Only used to generate SQL migrations (pnpm db:generate); no database connection needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
