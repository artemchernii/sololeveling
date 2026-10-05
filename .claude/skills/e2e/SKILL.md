---
name: e2e
description: Writing and running SOLO LEVELING browser tests (Playwright) on the throwaway test backend with mock data and canned AI readings — never on Artem's account. Use when adding or fixing any e2e test.
---

# e2e on mock data

- Run: `pnpm e2e` (all) or `pnpm exec playwright test e2e/<file>`.
  Starts the test backend (`e2e/backend`, :3210) and the app (:3200).
- First time on a machine: `pnpm e2e:setup`.
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
