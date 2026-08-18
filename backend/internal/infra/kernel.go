package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

const kernelSchemaSQL = `
CREATE SCHEMA IF NOT EXISTS collab;
CREATE SCHEMA IF NOT EXISTS cap;
CREATE TABLE IF NOT EXISTS collab.sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  channel_thread_id TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS collab.messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS collab.context_snapshots (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  conversation_id TEXT NOT NULL DEFAULT '',
  correlation_id TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cap.channel_inbound (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  event_id TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

// KernelStore dual-writes Agent OS aggregate roots (sessions/messages/snapshots/inbound).
type KernelStore struct {
	Pool *pgxpool.Pool
}

func (k *KernelStore) Available() bool { return k != nil && k.Pool != nil }

func (k *KernelStore) Owns(collection string) bool {
	switch collection {
	case "sessions", "messages", "context_snapshots", "channel_inbound":
		return true
	default:
		return false
	}
}

func (k *KernelStore) Ensure(ctx context.Context) error {
	if !k.Available() {
		return nil
	}
	_, err := k.Pool.Exec(ctx, kernelSchemaSQL)
	return err
}

func (k *KernelStore) UpsertCollection(ctx context.Context, collection string, items []map[string]any) error {
	if !k.Available() {
		return nil
	}
	switch collection {
	case "sessions":
		return k.upsertSessions(ctx, items)
	case "messages":
		return k.upsertMessages(ctx, FlattenMessageBuckets(items))
	case "context_snapshots":
		return k.upsertSnapshots(ctx, items)
	case "channel_inbound":
		return k.upsertInbound(ctx, items)
	default:
		return fmt.Errorf("kernel: unsupported collection %s", collection)
	}
}

func (k *KernelStore) List(ctx context.Context, collection string) ([]map[string]any, error) {
	if !k.Available() {
		return nil, nil
	}
	switch collection {
	case "sessions":
		return k.listPayloads(ctx, `SELECT payload FROM collab.sessions ORDER BY updated_at DESC`)
	case "messages":
		rows, err := k.listMessages(ctx)
		if err != nil {
			return nil, err
		}
		return GroupMessageBuckets(rows), nil
	case "context_snapshots":
		return k.listPayloads(ctx, `SELECT payload FROM collab.context_snapshots ORDER BY created_at DESC`)
	case "channel_inbound":
		return k.listPayloads(ctx, `SELECT payload FROM cap.channel_inbound ORDER BY created_at DESC`)
	default:
		return nil, nil
	}
}

func (k *KernelStore) upsertSessions(ctx context.Context, items []map[string]any) error {
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		_, err = k.Pool.Exec(ctx, `
			INSERT INTO collab.sessions (id, workspace_id, conversation_id, channel, channel_thread_id, payload, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6::jsonb, now())
			ON CONFLICT (id) DO UPDATE SET
			  workspace_id = EXCLUDED.workspace_id,
			  conversation_id = EXCLUDED.conversation_id,
			  channel = EXCLUDED.channel,
			  channel_thread_id = EXCLUDED.channel_thread_id,
			  payload = EXCLUDED.payload,
			  updated_at = now()
		`, id, str(item["workspaceId"]), coalesceStr(item["conversationId"], id),
			str(item["channel"]), str(item["channelThreadId"]), string(raw))
		if err != nil {
			log.Printf("kernel session upsert %s: %v", id, err)
			return err
		}
	}
	return nil
}

func (k *KernelStore) upsertMessages(ctx context.Context, rows []map[string]any) error {
	seenConv := map[string]struct{}{}
	for _, row := range rows {
		cid := str(row["conversationId"])
		if cid == "" {
			continue
		}
		if _, ok := seenConv[cid]; !ok {
			if _, err := k.Pool.Exec(ctx, `DELETE FROM collab.messages WHERE conversation_id = $1`, cid); err != nil {
				return err
			}
			seenConv[cid] = struct{}{}
		}
		id := str(row["id"])
		if id == "" {
			continue
		}
		raw, err := json.Marshal(row["payload"])
		if err != nil {
			return err
		}
		if string(raw) == "null" {
			raw, _ = json.Marshal(row)
		}
		_, err = k.Pool.Exec(ctx, `
			INSERT INTO collab.messages (id, workspace_id, conversation_id, payload, created_at)
			VALUES ($1,$2,$3,$4::jsonb, now())
			ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, workspace_id = EXCLUDED.workspace_id
		`, id, str(row["workspaceId"]), cid, string(raw))
		if err != nil {
			return err
		}
	}
	return nil
}

func (k *KernelStore) upsertSnapshots(ctx context.Context, items []map[string]any) error {
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		_, err = k.Pool.Exec(ctx, `
			INSERT INTO collab.context_snapshots (id, workspace_id, conversation_id, correlation_id, payload, created_at)
			VALUES ($1,$2,$3,$4,$5::jsonb, now())
			ON CONFLICT (id) DO UPDATE SET
			  workspace_id = EXCLUDED.workspace_id,
			  conversation_id = EXCLUDED.conversation_id,
			  correlation_id = EXCLUDED.correlation_id,
			  payload = EXCLUDED.payload
		`, id, str(item["workspaceId"]), str(item["conversationId"]), str(item["correlationId"]), string(raw))
		if err != nil {
			return err
		}
	}
	return nil
}

func (k *KernelStore) upsertInbound(ctx context.Context, items []map[string]any) error {
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		eventID := coalesceStr(item["eventId"], coalesceStr(item["event_id"], str(item["messageId"])))
		_, err = k.Pool.Exec(ctx, `
			INSERT INTO cap.channel_inbound (id, workspace_id, channel, event_id, payload, created_at)
			VALUES ($1,$2,$3,$4,$5::jsonb, now())
			ON CONFLICT (id) DO UPDATE SET
			  workspace_id = EXCLUDED.workspace_id,
			  channel = EXCLUDED.channel,
			  event_id = EXCLUDED.event_id,
			  payload = EXCLUDED.payload
		`, id, str(item["workspaceId"]), str(item["channel"]), eventID, string(raw))
		if err != nil {
			return err
		}
	}
	return nil
}

func (k *KernelStore) listPayloads(ctx context.Context, q string) ([]map[string]any, error) {
	rows, err := k.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			out = append(out, m)
		}
	}
	return out, rows.Err()
}

func (k *KernelStore) listMessages(ctx context.Context) ([]map[string]any, error) {
	rows, err := k.Pool.Query(ctx, `
		SELECT id, workspace_id, conversation_id, payload FROM collab.messages ORDER BY created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, ws, cid string
		var raw []byte
		if err := rows.Scan(&id, &ws, &cid, &raw); err != nil {
			return nil, err
		}
		var payload map[string]any
		if json.Unmarshal(raw, &payload) != nil {
			payload = map[string]any{}
		}
		if str(payload["id"]) == "" {
			payload["id"] = id
		}
		out = append(out, map[string]any{
			"id": id, "workspaceId": ws, "conversationId": cid, "payload": payload,
		})
	}
	return out, rows.Err()
}

// FlattenMessageBuckets turns kv snapshots {id: conv, messages: [...]} into per-message rows.
func FlattenMessageBuckets(items []map[string]any) []map[string]any {
	var out []map[string]any
	for _, doc := range items {
		cid := str(doc["id"])
		ws := str(doc["workspaceId"])
		msgs, _ := doc["messages"].([]map[string]any)
		if msgs == nil {
			if arr, ok := doc["messages"].([]any); ok {
				for _, x := range arr {
					if m, ok := x.(map[string]any); ok {
						msgs = append(msgs, m)
					}
				}
			}
		}
		for _, m := range msgs {
			id := str(m["id"])
			if id == "" {
				id = cid + "-anon"
			}
			out = append(out, map[string]any{
				"id": id, "workspaceId": ws, "conversationId": cid, "payload": m,
			})
		}
	}
	return out
}

// GroupMessageBuckets reconstructs kv message snapshots from kernel rows.
func GroupMessageBuckets(rows []map[string]any) []map[string]any {
	order := make([]string, 0)
	byCID := map[string][]map[string]any{}
	wsByCID := map[string]string{}
	for _, row := range rows {
		cid := str(row["conversationId"])
		if cid == "" {
			continue
		}
		if _, ok := byCID[cid]; !ok {
			order = append(order, cid)
		}
		payload, _ := row["payload"].(map[string]any)
		if payload == nil {
			payload = row
		}
		byCID[cid] = append(byCID[cid], payload)
		if ws := str(row["workspaceId"]); ws != "" {
			wsByCID[cid] = ws
		}
	}
	out := make([]map[string]any, 0, len(order))
	for _, cid := range order {
		out = append(out, map[string]any{
			"id": cid, "workspaceId": wsByCID[cid], "messages": byCID[cid],
		})
	}
	return out
}

func coalesceStr(v any, fallback string) string {
	if s := str(v); s != "" {
		return s
	}
	return fallback
}
