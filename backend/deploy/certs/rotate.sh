#!/usr/bin/env bash
# Short-lived leaf cert rotation (keeps CA). Default TTL = 1 day.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
TTL_DAYS="${1:-1}"
exec "$DIR/generate.sh" "$TTL_DAYS"
