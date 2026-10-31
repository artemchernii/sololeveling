import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

import { defineConfig, devices } from '@playwright/test'

import { assertFree, claimPorts } from './e2e/ports.ts'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md).
   The app talks to the test backend, whatever .env.local points at;
   both run on this checkout's own ports (e2e/ports.ts). .env.local only
   adds the Clerk keys. */
/* On GitHub the Clerk keys are Actions secrets, already in the
   environment; there is no .env.local (31 Oct, the full run moved off
   his Mac). */
const ci = !!process.env.CI
/* A new worktree has neither: say so, not ENOENT or a failed sign-in. */
for (const need of [...(ci ? [] : ['.env.local']), 'e2e/backend/.convex'])
  if (!existsSync(need))
    throw new Error(
      `${need} is missing — run pnpm e2e:setup once in this checkout.`,
    )
process.loadEnvFile('.env.e2e')
const ports = claimPorts()
/* Workers load this file too, while the servers are up: only the run
   itself checks. */
if (!process.env.TEST_WORKER_INDEX) assertFree(ports)
process.env.VITE_CONVEX_URL = `http://127.0.0.1:${ports.backend}`
process.env.VITE_CONVEX_SITE_URL = `http://127.0.0.1:${ports.site}`
/* Only the two Clerk keys come from .env.local — never its deployment
   (5 Oct: loading the whole file sent a test run's backend to his dev). */
const local = ci ? process.env : parseEnv(readFileSync('.env.local', 'utf8'))
process.env.CLERK_SECRET_KEY = local.CLERK_SECRET_KEY
process.env.CLERK_PUBLISHABLE_KEY = local.VITE_CLERK_PUBLISHABLE_KEY
process.env.VITE_CLERK_PUBLISHABLE_KEY = local.VITE_CLERK_PUBLISHABLE_KEY
delete process.env.CONVEX_DEPLOYMENT
/* The specs count days in local midnights, written in Lisbon. On GitHub
   the runner is UTC, and the Convex backend refuses any TZ, so only the
   test workers (and the browser, below) move to Lisbon. */
if (ci && process.env.TEST_WORKER_INDEX) process.env.TZ = 'Europe/Lisbon'

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  /* On GitHub: the report and traces are uploaded when a shard fails. */
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global.setup.ts',
  use: {
    baseURL: `http://localhost:${ports.app}`,
    trace: 'retain-on-failure',
    /* Landing and arriving are motion; a still cannot show them. */
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    /* He uses the app dark. */
    colorScheme: 'dark',
    ...(ci ? { timezoneId: 'Europe/Lisbon' } : {}),
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `cd e2e/backend && npx convex dev --tail-logs disable --local-cloud-port ${ports.backend} --local-site-port ${ports.site}`,
      /* Named outright: the test backend, whatever the shell has. */
      env: { CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent' },
      url: `http://127.0.0.1:${ports.backend}/version`,
      /* Never reuse: whatever answers on the port may be another
         checkout's, with another run's data. A taken port stops the run. */
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite dev --port ${ports.app} --strictPort`,
      env: { E2E_RUN: '1' },
      url: `http://localhost:${ports.app}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
