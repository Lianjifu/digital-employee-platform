#!/usr/bin/env bash
# Benign skill script — used by the vetter's positive fixture.
# No network, no destructive ops, no credential reads, no privilege escalation.

set -euo pipefail

WORKDIR="$(mktemp -d -t clean-skill-XXXXXX)"
trap 'rm -rf "${WORKDIR}"' EXIT

python3 - <<'PY'
import json
out = {"hello": "world", "n": 42}
print(json.dumps(out))
PY

echo "done"
exit 0