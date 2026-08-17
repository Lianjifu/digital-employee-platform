#!/bin/bash
# Keep local FE+BE up for digital-employee-platform (real DeepSeek; no Local Mock).
set -u
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/Users/LIANJIFU/ops/digital-employee-platform/backend/.tools/go/bin:$PATH"
ROOT="/Users/LIANJIFU/ops/digital-employee-platform"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
GATEWAY="$ROOT/scripts/dev-stack/gateway-proxy.py"
LOGDIR="/tmp/de-stack"
mkdir -p "$LOGDIR"
cd "$BACKEND" || exit 1

export DE_BAN_MOCK_TOKEN=0
export DE_DATABASE_URL='postgres://de:de@127.0.0.1:5432/digital_employee?sslmode=disable'
# Redis optional for local: only set when 6379 is listening (Docker Compose redis).
if /usr/sbin/lsof -nP -iTCP:6379 -sTCP:LISTEN >/dev/null 2>&1; then
  export DE_REDIS_URL='redis://127.0.0.1:6379/0'
else
  unset DE_REDIS_URL 2>/dev/null || true
  echo "$(date '+%F %T') warn: redis :6379 not listening; starting without DE_REDIS_URL" >>"$LOGDIR/keeper.log"
fi
export DE_PUBLIC_BASE_URL='http://127.0.0.1:8089'
export DE_POLICY_URL='http://127.0.0.1:8100'
export DE_CAP_URL='http://127.0.0.1:8102'
unset DE_LLM_BASE_URL DE_LLM_API_KEY DE_LLM_MODEL 2>/dev/null || true
export DE_EMBEDDED_CHAT=0
export DE_MODEL_CANDIDATE_TIMEOUT=45
export DE_COPILOT_STREAM_TIMEOUT=300

listening() { /usr/sbin/lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

start_one() {
  local port="$1" name="$2"; shift 2
  if listening "$port"; then return 0; fi
  echo "$(date '+%F %T') start $name :$port" >>"$LOGDIR/keeper.log"
  nohup "$@" >>"$LOGDIR/${name}.log" 2>&1 </dev/null &
  echo $! >"$LOGDIR/${name}.pid"
  sleep 0.5
}

start_vite() {
  if listening 5173; then return 0; fi
  # reclaim drifted ports
  for p in 5174 5175; do
    /usr/sbin/lsof -tiTCP:$p -sTCP:LISTEN 2>/dev/null | while read pid; do kill -9 "$pid" 2>/dev/null || true; done
  done
  echo "$(date '+%F %T') start de-web :5173" >>"$LOGDIR/keeper.log"
  (
    cd "$FRONTEND/web" || exit 1
    nohup ./node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort >>"$LOGDIR/de-web.log" 2>&1 </dev/null &
    echo $! >"$LOGDIR/de-web.pid"
  )
  sleep 1
}

echo "$(date '+%F %T') keeper boot pid=$$" >>"$LOGDIR/keeper.log"
while true; do
  start_one 8100 de-sys "$BACKEND/bin/de-sys"
  start_one 8101 de-collab env DE_POLICY_URL=http://127.0.0.1:8100 DE_CAP_URL=http://127.0.0.1:8102 DE_EMBEDDED_CHAT=0 DE_MODEL_CANDIDATE_TIMEOUT=45 DE_COPILOT_STREAM_TIMEOUT=300 "$BACKEND/bin/de-collab"
  start_one 8102 de-cap env DE_POLICY_URL=http://127.0.0.1:8100 DE_PUBLIC_BASE_URL=http://127.0.0.1:8089 DE_EMBEDDED_CHAT=0 DE_MODEL_CANDIDATE_TIMEOUT=45 DE_COPILOT_STREAM_TIMEOUT=300 "$BACKEND/bin/de-cap"
  start_one 8103 de-workflow env DE_WORKFLOW_WORKER=0 "$BACKEND/bin/de-workflow"
  start_one 8091 de-agent python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8091 --app-dir "$BACKEND/services/de-agent-runtime"
  start_one 8093 de-skill env DE_SKILL_REQUIRE_ISOLATION=0 DE_SKILL_ARTIFACT_DIR=/tmp/de-stack/artifacts DE_BIND_HOST=127.0.0.1 DE_BIND_PORT=8093 python3 "$BACKEND/runtimes/de_skill_runtime/main.py"
  start_one 8089 de-gateway python3 "$GATEWAY"
  start_vite
  sleep 5
done
