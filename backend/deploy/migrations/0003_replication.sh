#!/bin/bash
# First-init only: allow streaming replica from other compose services.
set -euo pipefail
if [ -n "${PGDATA:-}" ] && [ -f "$PGDATA/pg_hba.conf" ]; then
  echo "host replication de all scram-sha-256" >> "$PGDATA/pg_hba.conf"
fi
