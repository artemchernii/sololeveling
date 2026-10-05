import { defineConfig, devices } from '@playwright/test'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md).
   .env.e2e loads first and wins: the app on :3200 talks to the test
   backend on :3210, whatever .env.local points at. .env.local only adds
   the Clerk keys. */
process.loadEnvFile('.env.e2e')
process.loadEnvFile('.env.local')
process.env.CLERK_PUBLISHABLE_KEY ??= process.env.VITE_CLERK_PUBLISHABLE_KEY

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global.setup.ts',
  use: {
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npx convex dev --env-file .env.e2e --tail-logs disable',
      url: 'http://127.0.0.1:3210/version',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec vite dev --port 3200 --strictPort',
      url: 'http://localhost:3200',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
