---
name: e2e
description: Writing and running SOLO LEVELING browser tests (Playwright) on the throwaway test backend with mock data and canned AI readings — never on Artem's account. Use when adding or fixing any e2e test.
---

# e2e on mock data

- Run: `pnpm exec playwright test e2e/<file>` while building — only the
  spec files the change touches. The full suite runs on GitHub on every
  PR (`.github/workflows/e2e.yml`, four shards, Clerk keys from the
  `E2E_CLERK_*` Actions secrets); never run `pnpm e2e` whole on his Mac.
  A red shard: `gh run download <run id>` gets its report and traces.
  Starts the test backend (`e2e/backend`) and the app on this checkout's
  own ports (`e2e/ports.ts`; `node e2e/ports.ts` prints them), so two
  worktrees run at the same time. Each has its own test data
  (`e2e/backend/.convex`); they share only the Clerk test user's sign-in.
- First time in a checkout (each new worktree): `pnpm e2e:setup`. It
  copies `.env.local` from the main checkout when there is none.
- A port already taken stops the run and names who holds it — a server
  left over from a killed run, or a second run in the same folder.
- Test user: `e2e+clerk_test@example.com` (Clerk dev). `start(page)` in
  `e2e/helpers.ts` signs in and calls `e2e.reset` (his kind of bad day).
- Mock data and canned readings live in `convex/e2e.ts`. Every function
  there opens with `requireUser` then `guard()` (refuses without
  `E2E=1`, which only the test backend has). Add a convex-test for any
  new one, including the refusal.
- No paid AI: seed a `csvLayouts` row for a CSV, or insert a ready
  intake (see `readCrypto`) for a PDF/screenshot. Call it with
  `testClient().mutation(anyApi.e2e.<fn>, …)` after `start(page)`.
- Every test that writes asserts pending ("adding"/"saving") and the
  landed screen, then saves `e2e/screens/<name>.png` — look at it.
  Video is recorded for every test (`e2e/.results/*/video.webm`).

## Never

- Run `npx convex dev` with anonymous mode or `--env-file` from the
  repo root — it rewrites the app's `.env.local`. Only from `e2e/backend`.
- Load all of `.env.local` into the test config — only the Clerk keys.
- Press a write in the browser pane on his real data to "check".
After touching e2e infra: `shasum .env.local` before and after.
