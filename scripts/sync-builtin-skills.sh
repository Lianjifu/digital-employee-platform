#!/usr/bin/env bash
# Sync PilotDeck skills into backend/builtin/skills for DE platform builtin pack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${PILOTDECK_SKILLS:-${PILOTDECK_ROOT:-$HOME/PRO/PilotDeck}/skills}"
DEST="$ROOT/backend/builtin/skills"
if [[ ! -d "$SRC" ]]; then
  echo "PilotDeck skills not found: $SRC" >&2
  echo "Set PILOTDECK_SKILLS or PILOTDECK_ROOT" >&2
  exit 1
fi
mkdir -p "$DEST"
count=0
for d in "$SRC"/*/; do
  name="$(basename "$d")"
  rsync -a --delete "$d" "$DEST/$name/"
  count=$((count + 1))
done
echo "synced $count skills → $DEST"
