#!/usr/bin/env bash
# Scaffold a coarse-grained Go service directory (hexagonal placeholders).
set -euo pipefail
NAME="${1:-}"
[[ -n "$NAME" ]] || { echo "usage: $0 de-foo"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/services/$NAME"
mkdir -p "$DIR/internal/"{domain,application,adapters/inbound/http,adapters/outbound}
cat > "$DIR/SERVICE.md" <<MD
# $NAME

| 项 | 值 |
|----|----|
| 端口 | TBD |
| DE_SERVICE | ${NAME#de-} |

Handlers currently live in \`backend/internal/server\` filtered by ServiceMode.
MD
echo "created $DIR"
