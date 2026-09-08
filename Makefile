.PHONY: help test build lint skill-gate vet visualdiff ci-frontend ci-backend

# Default target prints the menu.
help:
	@echo "Digital Employee Platform — make targets"
	@echo ""
	@echo "  make test            — backend unit + integration tests (race)"
	@echo "  make build           — go build ./..."
	@echo "  make lint            — go vet ./..."
	@echo "  make skill-gate      — W1-D1 退出门槛：vetter strict + 签名 verify-skill"
	@echo "  make ci-backend      — alias for test + lint"
	@echo "  make ci-frontend     — frontend/web vitest (run inside frontend/web)"
	@echo ""
	@echo "Env knobs (override on the command line):"
	@echo "  SKILL_DIR    builtin skills dir   [backend/builtin/skills]"
	@echo "  MANIFEST      manifest.json path    [backend/builtin/skills/manifest.json]"

# ---------- Backend ----------

test:
	cd backend && go test -race -count=1 -timeout 300s ./internal/...

build:
	cd backend && go build ./...

lint vet:
	cd backend && go vet ./...

ci-backend: test lint

# ---------- W1-D1 退出门槛 ----------
# Runs BOTH vetter (strict) AND signature verify on every builtin skill
# directory under SKILL_DIR. Exits non-zero on first failure.

# Relative to backend/ since we cd into it.
BACKEND_SKILL_DIR ?= builtin/skills
BACKEND_MANIFEST  ?= builtin/skills/manifest.json

skill-gate:
	cd backend && go run ./cmd/verify-skill --manifest $(BACKEND_MANIFEST) --vet=strict $(BACKEND_SKILL_DIR)

# ---------- Frontend ----------

ci-frontend:
	cd frontend/web && npm ci --no-audit --no-fund && npx vitest run --reporter=default