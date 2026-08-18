-- Agent OS kernel aggregate roots (R2)
-- Dual-written with platform.kv_documents until kv rows for these collections are retired.

CREATE SCHEMA IF NOT EXISTS collab;
CREATE SCHEMA IF NOT EXISTS cap;

CREATE TABLE IF NOT EXISTS collab.sessions (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL DEFAULT '',
  conversation_id    TEXT NOT NULL DEFAULT '',
  channel            TEXT NOT NULL DEFAULT '',
  channel_thread_id  TEXT NOT NULL DEFAULT '',
  payload            JSONB NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collab_sessions_ws ON collab.sessions (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_collab_sessions_thread ON collab.sessions (workspace_id, channel, channel_thread_id);

CREATE TABLE IF NOT EXISTS collab.messages (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL DEFAULT '',
  conversation_id  TEXT NOT NULL,
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collab_messages_conv ON collab.messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS collab.context_snapshots (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL DEFAULT '',
  conversation_id  TEXT NOT NULL DEFAULT '',
  correlation_id   TEXT NOT NULL DEFAULT '',
  payload          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collab_snap_corr ON collab.context_snapshots (workspace_id, conversation_id, correlation_id);

CREATE TABLE IF NOT EXISTS cap.channel_inbound (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL DEFAULT '',
  channel       TEXT NOT NULL DEFAULT '',
  event_id      TEXT NOT NULL DEFAULT '',
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cap_inbound_event ON cap.channel_inbound (channel, event_id);

INSERT INTO platform.schema_migrations (version) VALUES ('0002_kernel_tables')
ON CONFLICT (version) DO NOTHING;
