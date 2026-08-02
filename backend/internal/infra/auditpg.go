package infra

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditSink persists audit events to Postgres (audit.events).
type AuditSink struct {
	Pool *pgxpool.Pool
}

func (a *AuditSink) Append(ctx context.Context, ev map[string]any) error {
	if a == nil || a.Pool == nil {
		return nil
	}
	id := str(ev["id"])
	if id == "" {
		id = fmt.Sprintf("audit-%d", time.Now().UnixNano())
	}
	ws := str(ev["workspaceId"])
	actor := str(ev["actor"])
	action := str(ev["action"])
	target := str(ev["target"])
	corr := str(ev["correlationId"])
	payload, _ := json.Marshal(ev)

	_, err := a.Pool.Exec(ctx, `
		INSERT INTO audit.events (id, workspace_id, actor_id, action, resource_type, resource_id, correlation_id, payload)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
		ON CONFLICT (id) DO NOTHING
	`, id, ws, actor, action, "target", target, corr, string(payload))
	if err != nil {
		log.Printf("audit persist failed: %v", err)
	}
	return err
}

func (a *AuditSink) ListRecent(ctx context.Context, workspaceIDs []string, limit int) ([]map[string]any, error) {
	if a == nil || a.Pool == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 200
	}
	if len(workspaceIDs) == 0 {
		return nil, nil
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT id, workspace_id, actor_id, action, resource_id, correlation_id, payload, created_at
		FROM audit.events
		WHERE workspace_id = ANY($1::text[])
		ORDER BY created_at DESC
		LIMIT $2
	`, workspaceIDs, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAuditRows(rows)
}

func (a *AuditSink) ListByCorrelation(ctx context.Context, correlationID string, limit int) ([]map[string]any, error) {
	if a == nil || a.Pool == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 50
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT id, workspace_id, actor_id, action, resource_id, correlation_id, payload, created_at
		FROM audit.events WHERE correlation_id = $1 ORDER BY created_at DESC LIMIT $2
	`, correlationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAuditRows(rows)
}

func scanAuditRows(rows pgx.Rows) ([]map[string]any, error) {
	var out []map[string]any
	for rows.Next() {
		var id, ws, actor, action, rid, corr string
		var payload []byte
		var created time.Time
		if err := rows.Scan(&id, &ws, &actor, &action, &rid, &corr, &payload, &created); err != nil {
			return nil, err
		}
		m := map[string]any{
			"id": id, "workspaceId": ws, "actor": actor, "action": action,
			"target": rid, "correlationId": corr, "time": created.UTC().Format(time.RFC3339),
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

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprint(v)
}
