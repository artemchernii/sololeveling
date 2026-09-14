#!/usr/bin/env bash
# Take a snapshot of the app's data — production and dev — as zip files you own.
#
#   pnpm backup                      → ~/Backups/sololeveling/
#   BACKUP_DIR=/Volumes/x pnpm backup → somewhere else
#
# Why both: production is what the deployed app reads, and dev is where the
# app has been lived in while it was being built. Losing either loses days.
#
# Exporting only reads. Nothing here writes to a deployment, and nothing here
# deletes an old backup — each is a few KB, and pruning a backup folder is a
# decision for a person, not a script.
#
# A backup nobody has restored is a hope. After taking one, prove it:
#   pnpm backup:drill
#
# Restoring for real (overwrites the deployment's data with the snapshot —
# anything written after the snapshot was taken is lost):
#   npx convex import <zip> --replace-all --prod
set -euo pipefail

dir="${BACKUP_DIR:-$HOME/Backups/sololeveling}"
stamp="$(date +%Y-%m-%d-%H%M)"
mkdir -p "$dir"

cd "$(git rev-parse --show-toplevel)"

for target in prod dev; do
  out="$dir/sololeveling-$target-$stamp.zip"
  echo "→ $target"
  npx convex export --deployment "$target" --path "$out"
done

echo
echo "Saved to $dir:"
ls -1 "$dir" | grep -- "-$stamp.zip"
