import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests read connection strings from the root .env (never overrides real env vars).
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['{apps,packages,tools}/*/src/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['{apps,packages,tools}/*/src/**/*.int.test.ts'],
          // Integration suites share one Postgres and one broker.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
