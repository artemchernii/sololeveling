#!/usr/bin/env bash
# Prove a backup restores: load it into a throwaway backend and check that
# every table came back with every row.
#
#   pnpm backup:drill                → the newest production backup
#   pnpm backup:drill path/to.zip    → a specific one
#
# The restore target is never a real deployment. The drill checks out this
# commit into a temporary folder and runs a local Convex backend there, with no
# account and its data kept inside that folder; `--replace-all` wipes only it.
# The folder, the backend and the restored copy are all removed at the end.
#
# The local backend needs every environment variable the auth config names
# before it will load the functions. It never checks a token during an import,
# so a placeholder issuer is enough.
#
# To check it, the restored backend is exported again and the two snapshots
# compared table by table: the rows that went in against the rows the backend
# gives back. (Reading tables back with `convex data` caps how many rows it
# returns, so a big table would look short, or fail outright.)
#
# PASS means every table's row count matches. A restore that "succeeds" and
# lands no rows is a FAIL, and says so — that is the whole point of drilling.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
dir="${BACKUP_DIR:-$HOME/Backups/sololeveling}"
zip="${1:-$(ls -t "$dir"/sololeveling-prod-*.zip 2>/dev/null | head -1 || true)}"

if [[ -z "$zip" || ! -f "$zip" ]]; then
  echo "No backup to drill. Take one first: pnpm backup" >&2
  exit 1
fi
zip="$(cd "$(dirname "$zip")" && pwd)/$(basename "$zip")"

work="$(mktemp -d -t sololeveling-drill)"
app="$work/app"
log="$work/convex-dev.log"
dev_pid=""

kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  [[ -n "$dev_pid" ]] && kill_tree "$dev_pid"
  git -C "$repo" worktree remove --force "$app" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# A local backend listens on a fixed port; one already there is someone
# else's, and importing into it is exactly what this script must never do.
if curl -s -o /dev/null "http://127.0.0.1:3210"; then
  echo "Something is already listening on port 3210. Stop it and run again." >&2
  exit 1
fi

echo "Backup:  $zip"
git -C "$repo" worktree add --detach "$app" HEAD >/dev/null
ln -s "$repo/node_modules" "$app/node_modules"
cd "$app"

export CONVEX_AGENT_MODE=anonymous
unset CONVEX_DEPLOYMENT CONVEX_DEPLOY_KEY

wait_for() {
  local what=$1 check=$2 i
  for i in $(seq 1 120); do
    if eval "$check"; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for $what. Log:" >&2
  tail -20 "$log" >&2
  exit 1
}

npx convex dev >"$log" 2>&1 &
dev_pid=$!
wait_for "the local backend" 'curl -s -o /dev/null http://127.0.0.1:3210'

npx convex env set CLERK_JWT_ISSUER_DOMAIN https://restore-drill.invalid >/dev/null
wait_for "the schema to load" 'grep -q "Convex functions ready" "$log"'

echo "Restoring into a throwaway local backend…"
npx convex import "$zip" --replace-all -y >/dev/null 2>&1

restored_zip="$work/restored.zip"
npx convex export --path "$restored_zip" >/dev/null 2>&1

rows() { unzip -p "$1" "$2/documents.jsonl" 2>/dev/null | grep -c . || true; }

echo
failed=0
tables="$(unzip -Z1 "$zip" | sed -n 's#^\([^_][^/]*\)/documents.jsonl$#\1#p' | sort)"
for table in $tables; do
  expected="$(rows "$zip" "$table")"
  restored="$(rows "$restored_zip" "$table")"
  if [[ "$expected" == "$restored" ]]; then
    printf '  ok    %-16s %s rows\n' "$table" "$restored"
  else
    printf '  FAIL  %-16s expected %s, restored %s\n' "$table" "$expected" "$restored"
    failed=1
  fi
done

echo
if [[ -z "$tables" ]]; then
  echo "FAIL — the backup holds no tables."
  exit 1
elif [[ "$failed" == 1 ]]; then
  echo "FAIL — this backup did not restore intact."
  exit 1
fi
echo "PASS — every table restored with every row."
