#!/usr/bin/env bash
# Once per checkout (each worktree has its own test data and ports): the throwaway test backend for `pnpm e2e`.
# Runs from e2e/backend so the Convex CLI never rewrites the app's
# .env.local. Copies the Clerk issuer from the dev deployment and sets
# E2E=1 on the test backend only — the flag e2e.reset insists on.
set -euo pipefail
cd "$(dirname "$0")/.."
# On GitHub (CI set) there is no .env.local and no dev deployment to ask:
# the Clerk keys are Actions secrets in the environment, and the issuer
# is read from the publishable key, which carries the Clerk domain.
if [ -n "${CI:-}" ]; then
  issuer=$(node -p "'https://' + Buffer.from(process.env.VITE_CLERK_PUBLISHABLE_KEY.split('_')[2], 'base64').toString().replace(/[\$]$/, '')")
else
  # A new worktree has no .env.local (it is not in git): take the main
  # checkout's, which is the first one git lists.
  if [ ! -f .env.local ]; then
    main=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
    [ -f "$main/.env.local" ] || {
      echo ".env.local is missing here and in $main — the Clerk keys and the dev deployment come from it. Stop."
      exit 1
    }
    cp "$main/.env.local" .env.local
    echo "copied .env.local from $main"
  fi
  issuer=$(npx convex env get CLERK_JWT_ISSUER_DOMAIN)
fi
# N1: a public key so ALLOW can be pressed in a test; no private key, so
# the test backend never sends a push.
vapid=$(node -p "require('web-push').generateVAPIDKeys().publicKey")
before=$(shasum .env.local 2>/dev/null || true)
read -r backend site _app < <(node e2e/ports.ts)
at=(--local-cloud-port "$backend" --local-site-port "$site")
cd e2e/backend
CONVEX_AGENT_MODE=anonymous npx convex dev --once ${CI:+--verbose} "${at[@]}" || true
npx convex env set CLERK_JWT_ISSUER_DOMAIN "$issuer"
npx convex env set E2E 1
npx convex env set VAPID_PUBLIC_KEY "$vapid"
npx convex dev --once "${at[@]}"
cd ../..
[ "$before" = "$(shasum .env.local 2>/dev/null || true)" ] || { echo "the app's .env.local changed — stop"; exit 1; }
echo "test backend ready — run pnpm e2e"
