package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// UsageSink persists usage meters to Postgres.
type UsageSink struct {
	Pool *pgxpool.Pool
}

func (u *UsageSink) Record(ctx context.Context, workspaceID, kind string, units int64, meta map[string]any) error {
	if u == nil || u.Pool == nil {
		return nil
	}
	id := fmt.Sprintf("usage-%d", time.Now().UnixNano())
	payload, _ := json.Marshal(meta)
	_, err := u.Pool.Exec(ctx, `
		INSERT INTO platform.usage_meters (id, workspace_id, meter_key, value, payload, updated_at)
		VALUES ($1, $2, $3, $4, $5::jsonb, now())
		ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, payload = EXCLUDED.payload, updated_at = now()
	`, id, workspaceID, kind, units, string(payload))
	if err != nil {
		log.Printf("usage persist failed: %v", err)
	}
	return err
}

func (u *UsageSink) List(ctx context.Context, workspaceID string, limit int) ([]map[string]any, error) {
	if u == nil || u.Pool == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 100
	}
	rows, err := u.Pool.Query(ctx, `
		SELECT id, workspace_id, meter_key, value, payload, updated_at
		FROM platform.usage_meters
		WHERE workspace_id = $1 OR $1 = ''
		ORDER BY updated_at DESC LIMIT $2
	`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, ws, key string
		var value int64
		var payload []byte
		var updated time.Time
		if err := rows.Scan(&id, &ws, &key, &value, &payload, &updated); err != nil {
			return nil, err
		}
		m := map[string]any{
			"id": id, "workspaceId": ws, "kind": key, "units": value,
			"at": updated.UTC().Format(time.RFC3339),
		}
		var raw map[string]any
		if json.Unmarshal(payload, &raw) == nil {
			for k, v := range raw {
				if _, ok := m[k]; !ok {
					m[k] = v
				}
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
