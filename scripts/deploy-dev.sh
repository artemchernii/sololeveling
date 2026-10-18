#!/usr/bin/env bash
# Push master's functions to the one dev Convex backend — the only way a
# session deploys dev (18 Oct).
#
#   pnpm deploy:dev                    → origin/master, as merged
#   pnpm deploy:dev feat/a fix/b       → origin/master with those branches
#                                        merged on top, for testing unmerged
#                                        work on localhost together
#
# Why: every branch shares one dev backend, and a deploy replaces its
# functions with exactly what the pushing checkout has — so a deploy from one
# branch deletes another branch's new functions (Review broke twice on
# 15 Oct). Each deploy also re-runs every open tab's queries, which is paid
# reads. So: deploy from master, once after a batch of merges, not per session.
#
# It builds in a throwaway worktree and removes it after; the checkout it is
# run from is never touched.
set -euo pipefail

main="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
if [ ! -f "$main/.env.local" ]; then
  echo "No .env.local in $main — it names the dev deployment." >&2
  exit 1
fi

git fetch -q origin
tmp="$(mktemp -d)/deploy-dev"
git worktree add -q --detach "$tmp" origin/master
trap 'git worktree remove --force "$tmp"' EXIT

cd "$tmp"
for branch in "$@"; do
  echo "→ merging $branch"
  git merge -q --no-edit "origin/$branch"
done

cp "$main/.env.local" .env.local
ln -s "$main/node_modules" node_modules

echo "→ deploying $(git log -1 --format='%h %s') to dev"
npx convex dev --once
