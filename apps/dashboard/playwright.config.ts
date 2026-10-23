import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a live stack (pnpm infra:up, collector and pnpm dev), using
// the admin from .env. They create and delete their own station and operator.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env: the defaults below match .env.example.
}

export const ADMIN_STATE = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Software WebGL, so the map and the 3D scene also render in headless runs.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testMatch: /\.spec\.ts/,
      testIgnore: /no-webgl\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
    {
      // A machine without graphics acceleration: WebGL is off in this browser.
      name: 'no-webgl',
      testMatch: /no-webgl\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: ADMIN_STATE,
        launchOptions: { args: ['--disable-3d-apis'] },
      },
      dependencies: ['setup'],
    },
  ],
});
