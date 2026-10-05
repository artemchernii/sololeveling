#!/usr/bin/env bash
# Once per machine: the throwaway test backend for `pnpm e2e`.
# Runs from e2e/backend so the Convex CLI never rewrites the app's
# .env.local. Copies the Clerk issuer from the dev deployment and sets
# E2E=1 on the test backend only — the flag e2e.reset insists on.
set -euo pipefail
cd "$(dirname "$0")/.."
issuer=$(npx convex env get CLERK_JWT_ISSUER_DOMAIN)
before=$(shasum .env.local)
cd e2e/backend
CONVEX_AGENT_MODE=anonymous npx convex dev --once || true
npx convex env set CLERK_JWT_ISSUER_DOMAIN "$issuer"
npx convex env set E2E 1
npx convex dev --once
cd ../..
[ "$before" = "$(shasum .env.local)" ] || { echo "the app's .env.local changed — stop"; exit 1; }
echo "test backend ready — run pnpm e2e"
