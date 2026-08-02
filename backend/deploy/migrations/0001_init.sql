-- platform / policy / audit baseline schemas (M1)
-- Applied automatically by Postgres docker entrypoint via /docker-entrypoint-initdb.d

CREATE SCHEMA IF NOT EXISTS platform;
CREATE SCHEMA IF NOT EXISTS policy;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.workspaces (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.memberships (
  user_id       TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES platform.workspaces(id),
  role          TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS platform.kv_documents (
  collection   TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  id           TEXT NOT NULL,
  payload      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_kv_workspace ON platform.kv_documents (collection, workspace_id);

CREATE TABLE IF NOT EXISTS policy.decisions (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  resource        TEXT NOT NULL,
  action          TEXT NOT NULL,
  allow           BOOLEAN NOT NULL,
  reason          TEXT NOT NULL DEFAULT '',
  correlation_id  TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit.events (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL DEFAULT '',
  resource_id     TEXT NOT NULL DEFAULT '',
  correlation_id  TEXT NOT NULL DEFAULT '',
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_ws_time ON audit.events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_corr ON audit.events (correlation_id);

CREATE TABLE IF NOT EXISTS platform.usage_meters (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  meter_key     TEXT NOT NULL,
  value         BIGINT NOT NULL DEFAULT 0,
  payload       JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_ws ON platform.usage_meters (workspace_id, meter_key);

INSERT INTO platform.schema_migrations (version) VALUES ('0001_init')
ON CONFLICT (version) DO NOTHING;
