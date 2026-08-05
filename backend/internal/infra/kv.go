package infra

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// KVStore persists control-plane documents in platform.kv_documents.
type KVStore struct {
	Pool *pgxpool.Pool
}

func (k *KVStore) Available() bool { return k != nil && k.Pool != nil }

func (k *KVStore) Upsert(ctx context.Context, collection, workspaceID, id string, payload any) error {
	if !k.Available() {
		return nil
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = k.Pool.Exec(ctx, `
		INSERT INTO platform.kv_documents (collection, workspace_id, id, payload, updated_at)
		VALUES ($1, $2, $3, $4::jsonb, now())
		ON CONFLICT (collection, workspace_id, id)
		DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
	`, collection, workspaceID, id, string(raw))
	return err
}

func (k *KVStore) UpsertMany(ctx context.Context, collection string, items []map[string]any) error {
	if !k.Available() {
		return nil
	}
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		ws := str(item["workspaceId"])
		if err := k.Upsert(ctx, collection, ws, id, item); err != nil {
			log.Printf("kv upsert %s/%s: %v", collection, id, err)
			return err
		}
	}
	return nil
}

// Delete removes one document. workspaceID may be "" to delete any workspace row with that id.
func (k *KVStore) Delete(ctx context.Context, collection, workspaceID, id string) error {
	if !k.Available() || id == "" {
		return nil
	}
	if workspaceID != "" {
		_, err := k.Pool.Exec(ctx, `
			DELETE FROM platform.kv_documents WHERE collection = $1 AND workspace_id = $2 AND id = $3
		`, collection, workspaceID, id)
		return err
	}
	_, err := k.Pool.Exec(ctx, `
		DELETE FROM platform.kv_documents WHERE collection = $1 AND id = $2
	`, collection, id)
	return err
}

// DeleteMany removes documents by id (any workspace_id). Safe for multi-writer collections.
func (k *KVStore) DeleteMany(ctx context.Context, collection string, ids []string) error {
	if !k.Available() || len(ids) == 0 {
		return nil
	}
	_, err := k.Pool.Exec(ctx, `
		DELETE FROM platform.kv_documents WHERE collection = $1 AND id = ANY($2)
	`, collection, ids)
	return err
}

// ReplaceCollection deletes all rows for a collection then upserts.
// Prefer UpsertMany + Delete for multi-process collections (sessions/messages/memory).
func (k *KVStore) ReplaceCollection(ctx context.Context, collection string, items []map[string]any) error {
	if !k.Available() {
		return nil
	}
	tx, err := k.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM platform.kv_documents WHERE collection = $1`, collection); err != nil {
		return err
	}
	for _, item := range items {
		id := str(item["id"])
		if id == "" {
			continue
		}
		ws := str(item["workspaceId"])
		raw, err := json.Marshal(item)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO platform.kv_documents (collection, workspace_id, id, payload, updated_at)
			VALUES ($1, $2, $3, $4::jsonb, now())
		`, collection, ws, id, string(raw)); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (k *KVStore) List(ctx context.Context, collection string) ([]map[string]any, error) {
	if !k.Available() {
		return nil, nil
	}
	rows, err := k.Pool.Query(ctx, `
		SELECT payload FROM platform.kv_documents
		WHERE collection = $1 ORDER BY updated_at DESC
	`, collection)
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

func (k *KVStore) Count(ctx context.Context, collection string) (int, error) {
	if !k.Available() {
		return 0, nil
	}
	var n int
	err := k.Pool.QueryRow(ctx, `SELECT count(*) FROM platform.kv_documents WHERE collection = $1`, collection).Scan(&n)
	return n, err
}

// SnapshotTime is for readiness / ops.
func (k *KVStore) SnapshotTime(ctx context.Context) (time.Time, error) {
	if !k.Available() {
		return time.Time{}, nil
	}
	var t time.Time
	err := k.Pool.QueryRow(ctx, `SELECT coalesce(max(updated_at), to_timestamp(0)) FROM platform.kv_documents`).Scan(&t)
	return t, err
}
