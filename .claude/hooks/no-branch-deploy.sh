#!/usr/bin/env bash
# Refuses a direct dev deploy from a session (18 Oct). `npx convex dev` from a
# branch replaces the shared dev backend's functions with that branch's, and
# deletes every other branch's. Dev is deployed with `pnpm deploy:dev`, which
# builds master and every open branch in a throwaway worktree. `--local` (the e2e test backend) is
# not dev and passes.
cmd="$(jq -r '.tool_input.command // empty')"
if printf '%s' "$cmd" | grep -Eq 'convex[[:space:]]+dev' &&
  ! printf '%s' "$cmd" | grep -q -- '--local'; then
  echo 'Dev Convex is deployed only through `pnpm deploy:dev`: master with every open branch pushed in the last 3 days, all at once (`--dry-run` lists them). A session runs it itself once a branch is ready for his check — see CLAUDE.md "Deploying dev".' >&2
  exit 2
fi
exit 0
