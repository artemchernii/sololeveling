import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import { defineConfig, devices } from '@playwright/test'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md).
   .env.e2e loads first and wins: the app on :3200 talks to the test
   backend on :3210, whatever .env.local points at. .env.local only adds
   the Clerk keys. */
process.loadEnvFile('.env.e2e')
/* Only the two Clerk keys come from .env.local — never its deployment
   (5 Oct: loading the whole file sent a test run's backend to his dev). */
const local = parseEnv(readFileSync('.env.local', 'utf8'))
process.env.CLERK_SECRET_KEY = local.CLERK_SECRET_KEY
process.env.CLERK_PUBLISHABLE_KEY = local.VITE_CLERK_PUBLISHABLE_KEY
process.env.VITE_CLERK_PUBLISHABLE_KEY = local.VITE_CLERK_PUBLISHABLE_KEY
delete process.env.CONVEX_DEPLOYMENT

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
    /* Landing and arriving are motion; a still cannot show them. */
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    /* He uses the app dark. */
    colorScheme: 'dark',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'cd e2e/backend && npx convex dev --tail-logs disable',
      /* Named outright: the test backend, whatever the shell has. */
      env: { CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent' },
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
