.PHONY: run test tidy build compose-up compose-up-full compose-up-temporal compose-up-oidc compose-up-authentik compose-up-kafka compose-up-mtls compose-up-spiffe compose-up-split compose-up-coarse compose-up-milvus compose-up-opa compose-up-search compose-up-obs compose-up-policy compose-up-audit compose-up-apps compose-up-staging compose-down compose-ps compose-logs infra-env smoke smoke-coarse test-python runtime rag skill policy audit de-policy de-audit de-workflow docker-engine buf-generate worker certs certs-rotate run-sys run-collab run-cap run-workflow


export DE_CORE_ADDR ?= :8080
export DE_DATABASE_URL ?= postgres://de:de@127.0.0.1:5432/digital_employee?sslmode=disable
export DE_REDIS_URL ?= redis://127.0.0.1:6379/0
export PATH := /opt/homebrew/bin:$(PATH)

# Prefer backend/.tools/go when present (toolchain bootstrap; not a source tree).
GO ?= $(shell if [ -x "$(CURDIR)/.tools/go/bin/go" ]; then echo "$(CURDIR)/.tools/go/bin/go"; else echo go; fi)
COMPOSE := docker compose -f deploy/compose.yml

run: infra-env
	$(GO) run ./cmd/de-core

run-sys: infra-env
	$(GO) run ./cmd/de-sys

run-collab: infra-env
	$(GO) run ./cmd/de-collab

run-cap: infra-env
	$(GO) run ./cmd/de-cap

run-workflow: infra-env
	DE_WORKFLOW_HTTP=1 DE_WORKFLOW_WORKER=$${DE_WORKFLOW_WORKER:-0} $(GO) run ./cmd/de-workflow

test:
	$(GO) test ./...

tidy:
	$(GO) mod tidy

build:
	$(GO) build -o ./bin/de-core ./cmd/de-core
	$(GO) build -o ./bin/de-sys ./cmd/de-sys
	$(GO) build -o ./bin/de-collab ./cmd/de-collab
	$(GO) build -o ./bin/de-cap ./cmd/de-cap
	$(GO) build -o ./bin/de-workflow ./cmd/de-workflow

docker-engine:
	@command -v docker >/dev/null || { echo "docker CLI missing; brew install docker colima"; exit 1; }
	@if ! docker info >/dev/null 2>&1; then \
		echo "starting Colima Docker engine..."; \
		colima start --cpu 2 --memory 4 --disk 20; \
	fi
	@docker info >/dev/null

compose-up: docker-engine
	$(COMPOSE) up -d
	@echo "waiting for postgres + redis healthy..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do \
		ok=$$(docker inspect -f '{{.State.Health.Status}}' de-postgres 2>/dev/null || echo starting); \
		rok=$$(docker inspect -f '{{.State.Health.Status}}' de-redis 2>/dev/null || echo starting); \
		echo "  try $$i: postgres=$$ok redis=$$rok"; \
		if [ "$$ok" = "healthy" ] && [ "$$rok" = "healthy" ]; then \
			echo "applying SQL migrations (idempotent)..."; \
			for f in deploy/migrations/*.sql; do \
				docker exec -i de-postgres psql -U de -d digital_employee < "$$f" >/dev/null; \
			done; \
			echo "infra ready"; \
			echo "  DE_DATABASE_URL=$(DE_DATABASE_URL)"; \
			echo "  DE_REDIS_URL=$(DE_REDIS_URL)"; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "infra not healthy yet; check: make compose-logs"; exit 1

compose-up-full: docker-engine
	$(COMPOSE) --profile full up -d
	@$(MAKE) compose-up

compose-up-temporal: docker-engine
	$(COMPOSE) --profile temporal up -d
	@echo "Temporal frontend: 127.0.0.1:7233 — set DE_TEMPORAL_HOST=127.0.0.1:7233"
	@echo "Worker: cd backend && make worker"

compose-up-oidc: docker-engine
	$(COMPOSE) --profile oidc up -d
	@echo "Dex OIDC: http://127.0.0.1:5556/dex"
	@echo "  DE_OIDC_ISSUER=http://127.0.0.1:5556/dex"
	@echo "  DE_OIDC_CLIENT_ID=de-core"
	@echo "  DE_OIDC_CLIENT_SECRET=de-core-secret"
	@echo "  DE_OIDC_AUTH_PATH=/auth"

compose-up-authentik: docker-engine
	$(COMPOSE) --profile authentik up -d
	@echo "Authentik UI: http://127.0.0.1:9000 (bootstrap admin@acme.com / authentik)"
	@echo "  setup OAuth2 app slug=de → see deploy/authentik/README.md"
	@echo "  DE_OIDC_ISSUER=http://127.0.0.1:9000/application/o/de/"

compose-up-obs: docker-engine
	$(COMPOSE) --profile obs up -d
	@echo "Prometheus: http://127.0.0.1:9090  Grafana: http://127.0.0.1:3000 (admin/admin)"

compose-up-kafka: docker-engine
	$(COMPOSE) --profile kafka up -d
	@echo "Redpanda Kafka: 127.0.0.1:19092 — set DE_KAFKA_BROKERS=127.0.0.1:19092"

compose-up-mtls: docker-engine certs
	$(COMPOSE) --profile mtls up -d
	@echo "Envoy mTLS: https://127.0.0.1:8443"

compose-up-spiffe: docker-engine certs
	$(COMPOSE) --profile spiffe up -d
	@echo "Envoy SPIFFE mTLS: https://127.0.0.1:8444 — see deploy/spiffe/README.md"

compose-up-split: docker-engine
	$(COMPOSE) --profile split up -d
	@echo "Envoy path-split gateway: http://127.0.0.1:8089"

compose-up-coarse: docker-engine
	@$(MAKE) compose-up
	$(COMPOSE) --profile coarse up -d --build
	@echo "coarse: gateway:8089 → sys:8100 collab:8101 cap:8102 workflow:8103 + FastAPI 8091-8093"
	@echo "  FE: VITE_API_BASE=http://127.0.0.1:8089"

compose-up-milvus: docker-engine
	$(COMPOSE) --profile milvus up -d
	@echo "waiting for Milvus healthy..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		ok=$$(docker inspect -f '{{.State.Health.Status}}' de-milvus 2>/dev/null || echo starting); \
		echo "  try $$i: milvus=$$ok"; \
		if [ "$$ok" = "healthy" ]; then \
			echo "Milvus ready: http://127.0.0.1:19530"; \
			echo "  export DE_MILVUS_URI=http://127.0.0.1:19530"; \
			echo "  pip install -r services/de-rag/requirements-milvus.txt && make rag"; \
			exit 0; \
		fi; \
		sleep 3; \
	done; \
	echo "Milvus not healthy yet; check: docker logs de-milvus"; exit 1

compose-up-opa: docker-engine
	$(COMPOSE) --profile opa up -d
	@echo "OPA: http://127.0.0.1:8181 — set DE_OPA_URL=http://127.0.0.1:8181"

compose-up-search: docker-engine
	$(COMPOSE) --profile search up -d
	@echo "waiting for OpenSearch healthy..."
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do \
		ok=$$(docker inspect -f '{{.State.Health.Status}}' de-opensearch 2>/dev/null || echo starting); \
		echo "  try $$i: opensearch=$$ok"; \
		if [ "$$ok" = "healthy" ]; then \
			echo "OpenSearch ready: http://127.0.0.1:9200"; \
			echo "  export DE_OPENSEARCH_URL=http://127.0.0.1:9200"; \
			exit 0; \
		fi; \
		sleep 3; \
	done; \
	echo "OpenSearch not healthy yet; check: docker logs de-opensearch"; exit 1

compose-up-policy compose-up-de-policy: docker-engine
	$(COMPOSE) --profile policy up -d --build
	@echo "de-policy: http://127.0.0.1:8094 — see deploy/de-policy/README.md"

compose-up-audit compose-up-de-audit: docker-engine
	@$(MAKE) compose-up
	$(COMPOSE) --profile audit up -d --build
	@echo "de-audit: http://127.0.0.1:8095 — see deploy/de-audit/README.md"

compose-up-apps: docker-engine
	@$(MAKE) compose-up
	$(COMPOSE) --profile apps up -d --build
	@echo "apps: de-core(:8080) de-policy(:8094) de-audit(:8095) de-agent-runtime(:8091) de-rag(:8092) de-skill-runtime(:8093)"
	@echo "optional: make compose-up-temporal && $(COMPOSE) --profile apps up -d de-workflow"

# Staging: apps + oidc + opa + search + obs, with hardened auth (see deploy/.env.staging)
compose-up-staging: docker-engine
	@$(MAKE) compose-up
	@set -a; \
	if [ -f deploy/.env.staging ]; then . ./deploy/.env.staging; fi; \
	set +a; \
	$(COMPOSE) --profile apps --profile oidc --profile opa --profile search --profile obs --profile policy --profile audit up -d --build
	@echo "staging: BAN_MOCK=1 FORCE_OIDC=1 — Dex :5556 · OPA · OpenSearch · Obs · de-policy/de-audit"
	@echo "env file: deploy/.env.staging (override before make if needed)"

compose-down:
	$(COMPOSE) --profile full --profile temporal --profile oidc --profile authentik --profile kafka --profile mtls --profile spiffe --profile split --profile coarse --profile milvus --profile opa --profile search --profile obs --profile policy --profile audit --profile apps down

buf-generate:
	@command -v buf >/dev/null || { echo "install buf CLI into PATH"; exit 1; }
	@command -v protoc-gen-go >/dev/null || $(GO) install google.golang.org/protobuf/cmd/protoc-gen-go@v1.35.2
	@command -v protoc-gen-connect-go >/dev/null || $(GO) install connectrpc.com/connect/cmd/protoc-gen-connect-go@v1.17.0
	PATH="$(HOME)/go/bin:$(PATH)" buf generate

certs:
	@bash deploy/certs/generate.sh

certs-rotate:
	@bash deploy/certs/rotate.sh 1

worker de-workflow:
	$(GO) run ./cmd/de-workflow

policy de-policy:
	$(GO) run ./cmd/de-policy

audit de-audit:
	$(GO) run ./cmd/de-audit

compose-ps:
	$(COMPOSE) ps

compose-logs:
	$(COMPOSE) logs --tail=100

infra-env:
	@test -f deploy/.env || cp deploy/.env.example deploy/.env
	@echo "using DE_DATABASE_URL=$(DE_DATABASE_URL)"
	@echo "using DE_REDIS_URL=$(DE_REDIS_URL)"

runtime:
	pip install -q -r services/de-agent-runtime/requirements.txt
	python3 runtimes/de_agent_runtime/main.py

rag:
	@echo "RAG backend: $${DE_MILVUS_URI:-vector-memory}"
	pip install -q -r services/de-rag/requirements.txt
	python3 runtimes/de_rag/main.py

skill:
	pip install -q -r services/de-skill-runtime/requirements.txt
	python3 runtimes/de_skill_runtime/main.py

BASE ?= http://127.0.0.1:8080

smoke:
	@curl -sf $(BASE)/healthz >/dev/null && echo "healthz ok" || (echo "start de-core first: make run" && exit 1)
	@TOKEN=$$(curl -sf -X POST $(BASE)/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acme.com","password":"x"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])') && \
	curl -sf -H "Authorization: Bearer $$TOKEN" $(BASE)/api/workspaces >/dev/null && echo "workspaces ok" && \
	curl -sf -X POST -H "Authorization: Bearer $$TOKEN" -H 'Content-Type: application/json' -d '{"resource":"workflow","action":"publish"}' $(BASE)/api/zero-trust/evaluate >/dev/null && echo "evaluate ok"

smoke-coarse:
	@$(MAKE) smoke BASE=http://127.0.0.1:8089
	@curl -sf http://127.0.0.1:8100/healthz >/dev/null && echo "sys healthz ok"
	@TOKEN=$$(curl -sf -X POST http://127.0.0.1:8089/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@acme.com","password":"x"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])') && \
	curl -sf -H "Authorization: Bearer $$TOKEN" http://127.0.0.1:8102/api/channel/deployments >/dev/null && echo "cap channel ok"

test-python:
	python3 runtimes/de_rag/test_vector.py
	python3 runtimes/de_skill_runtime/test_runtoken.py
