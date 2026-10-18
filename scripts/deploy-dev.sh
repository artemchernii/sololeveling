#!/usr/bin/env bash
# Push master's functions, and every branch waiting to be tested, to the one
# dev Convex backend — the only way a session deploys dev (18 Oct).
#
#   pnpm deploy:dev                → origin/master, with every unmerged
#                                    feat/ fix/ claude/ branch pushed in the
#                                    last 3 days merged on top (not one
#                                    whose PR was closed unmerged)
#   pnpm deploy:dev --dry-run      → the same, without the deploy: says which
#                                    branches would go up and which conflict
#   pnpm deploy:dev feat/a fix/b   → origin/master with only those branches
#
# Why: every branch shares one dev backend, and a deploy replaces its
# functions with exactly what the pushing checkout has — so a deploy from one
# branch deletes another branch's new functions (Review broke twice on
# 15 Oct). Each deploy also re-runs every open tab's queries, which is paid
# reads. So: one deploy for everything open, a few times a day. Artem: "I
# dont want to type myself command and memorize all sessions branches" —
# with 7–10 sessions a day, the script finds them.
#
# A branch that does not merge cleanly onto the others is left out and named;
# the rest still go up. It builds in a throwaway worktree and removes it
# after; the checkout it is run from is never touched.
set -euo pipefail

DAYS=3
dry=0
picked=()
for a in "$@"; do
  case "$a" in
    --dry-run | -n) dry=1 ;;
    -*)
      echo "Unknown option $a" >&2
      exit 1
      ;;
    *) picked+=("$a") ;;
  esac
done

main="$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')"
if [ "$dry" -eq 0 ] && [ ! -f "$main/.env.local" ]; then
  echo "No .env.local in $main — it names the dev deployment." >&2
  exit 1
fi

git fetch -q --prune origin

branches=()
if [ "${#picked[@]}" -gt 0 ]; then
  branches=("${picked[@]}")
else
  since=$(($(date +%s) - DAYS * 86400))
  # Work dropped on purpose: its PR was closed without a merge.
  closed=" $(gh pr list --state closed --limit 100 \
    --json headRefName,mergedAt \
    --jq '.[] | select(.mergedAt == null) | .headRefName' 2>/dev/null |
    tr '\n' ' ')"
  while read -r ref at; do
    [ "$at" -ge "$since" ] || continue
    b="${ref#origin/}"
    case " $closed " in *" $b "*) continue ;; esac
    branches+=("$b")
  done < <(git for-each-ref --sort=committerdate \
    --format='%(refname:short) %(committerdate:unix)' \
    --no-merged origin/master \
    refs/remotes/origin/feat/ refs/remotes/origin/fix/ refs/remotes/origin/claude/)
fi

tmp="$(mktemp -d)/deploy-dev"
git worktree add -q --detach "$tmp" origin/master
trap 'git worktree remove --force "$tmp"' EXIT
cd "$tmp"

went=()
left=()
for branch in ${branches[@]+"${branches[@]}"}; do
  if git merge -q --no-edit "origin/$branch" >/dev/null 2>&1; then
    went+=("$branch")
  else
    git merge --abort 2>/dev/null || git reset -q --hard HEAD
    left+=("$branch")
  fi
done

echo "master  $(git log -1 --format='%h %s' origin/master)"
for b in ${went[@]+"${went[@]}"}; do echo "  + $b"; done
for b in ${left[@]+"${left[@]}"}; do echo "  ✗ $b — conflicts, left out"; done
if [ "${#went[@]}" -eq 0 ]; then
  echo "  (no unmerged branch from the last $DAYS days)"
fi

if [ "$dry" -eq 1 ]; then
  echo "dry run — nothing deployed"
  exit 0
fi

cp "$main/.env.local" .env.local
ln -s "$main/node_modules" node_modules

echo "→ deploying to dev"
npx convex dev --once
