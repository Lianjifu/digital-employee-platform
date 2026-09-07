package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteHooks is the SQLite-backed PersistFunc/DeleteFunc bundle used by
// the dual-stack contract (ADR-028). It mirrors infra.KVStore's surface
// so the rest of the platform is driver-agnostic.
type SQLiteHooks struct {
	DB *sql.DB
}

// ErrSQLitePathEmpty is returned when OpenSQLite receives an empty path.
var ErrSQLitePathEmpty = errors.New("sqlite: path is required")

// OpenSQLite opens (or creates) the SQLite database at path, applies
// safe PRAGMAs (WAL, busy_timeout, foreign_keys), and runs the schema.
// Parent directory is created with 0755 if missing.
func OpenSQLite(path string) (*SQLiteHooks, error) {
	if path == "" {
		return nil, ErrSQLitePathEmpty
	}
	if dir := filepath.Dir(path); dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("sqlite mkdir: %w", err)
		}
	}
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(on)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("sqlite ping: %w", err)
	}
	if _, err := db.ExecContext(context.Background(), sqliteSchema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("sqlite schema: %w", err)
	}
	return &SQLiteHooks{DB: db}, nil
}

// Close releases the underlying database handle.
func (h *SQLiteHooks) Close() error {
	if h == nil || h.DB == nil {
		return nil
	}
	return h.DB.Close()
}

// SQLiteSchema is intentionally aligned with platform.kv_documents
// (collection, workspace_id, id, payload, updated_at) so the two
// drivers are interchangeable from the platform's perspective.
const sqliteSchema = `CREATE TABLE IF NOT EXISTS kv_documents (
    collection   TEXT NOT NULL,
    workspace_id TEXT NOT NULL DEFAULT '',
    id           TEXT NOT NULL,
    payload      BLOB NOT NULL,
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY(collection, workspace_id, id)
);
CREATE INDEX IF NOT EXISTS idx_kv_collection ON kv_documents(collection);`

// Persist matches store.PersistFunc.
func (h *SQLiteHooks) Persist(ctx context.Context, collection string, items []map[string]any) error {
	if h == nil || h.DB == nil {
		return nil
	}
	if ShouldReplaceOnPersist(collection) {
		return h.replaceCollection(ctx, collection, items)
	}
	return h.upsertMany(ctx, collection, items)
}

func (h *SQLiteHooks) upsertMany(ctx context.Context, collection string, items []map[string]any) error {
	tx, err := h.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("sqlite begin: %w", err)
	}
	defer tx.Rollback()
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO kv_documents(collection, workspace_id, id, payload, updated_at)
		VALUES(?, ?, ?, ?, ?)
		ON CONFLICT(collection, workspace_id, id) DO UPDATE SET
			payload = excluded.payload, updated_at = excluded.updated_at
	`)
	if err != nil {
		return fmt.Errorf("sqlite prepare: %w", err)
	}
	defer stmt.Close()
	now := time.Now().Unix()
	for _, item := range items {
		id, _ := item["id"].(string)
		if id == "" {
			continue
		}
		ws, _ := item["workspaceId"].(string)
		raw, err := json.Marshal(item)
		if err != nil {
			return fmt.Errorf("sqlite marshal: %w", err)
		}
		if _, err := stmt.ExecContext(ctx, collection, ws, id, raw, now); err != nil {
			return fmt.Errorf("sqlite upsert: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("sqlite commit: %w", err)
	}
	return nil
}

func (h *SQLiteHooks) replaceCollection(ctx context.Context, collection string, items []map[string]any) error {
	tx, err := h.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("sqlite begin: %w", err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM kv_documents WHERE collection = ?`, collection); err != nil {
		return fmt.Errorf("sqlite delete: %w", err)
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO kv_documents(collection, workspace_id, id, payload, updated_at)
		VALUES(?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("sqlite prepare: %w", err)
	}
	defer stmt.Close()
	now := time.Now().Unix()
	for _, item := range items {
		id, _ := item["id"].(string)
		if id == "" {
			continue
		}
		ws, _ := item["workspaceId"].(string)
		raw, err := json.Marshal(item)
		if err != nil {
			return fmt.Errorf("sqlite marshal: %w", err)
		}
		if _, err := stmt.ExecContext(ctx, collection, ws, id, raw, now); err != nil {
			return fmt.Errorf("sqlite insert: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("sqlite commit: %w", err)
	}
	return nil
}

// Delete matches store.DeleteFunc. ids slice elements without ids are skipped.
func (h *SQLiteHooks) Delete(ctx context.Context, collection string, ids []string) error {
	if h == nil || h.DB == nil || len(ids) == 0 {
		return nil
	}
	args := make([]any, 0, len(ids)+1)
	args = append(args, collection)
	placeholders := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, id)
	}
	if len(placeholders) == 0 {
		return nil
	}
	q := `DELETE FROM kv_documents WHERE collection = ? AND id IN (` + strings.Join(placeholders, ",") + `)`
	if _, err := h.DB.ExecContext(ctx, q, args...); err != nil {
		return fmt.Errorf("sqlite delete: %w", err)
	}
	return nil
}

// List returns all documents for collection ordered by updated_at DESC.
// Used by tests and (optionally) by readiness probes.
func (h *SQLiteHooks) List(ctx context.Context, collection string) ([]map[string]any, error) {
	if h == nil || h.DB == nil {
		return nil, nil
	}
	rows, err := h.DB.QueryContext(ctx, `SELECT payload FROM kv_documents WHERE collection = ? ORDER BY updated_at DESC`, collection)
	if err != nil {
		return nil, fmt.Errorf("sqlite list: %w", err)
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err == nil {
			out = append(out, m)
		}
	}
	return out, rows.Err()
}

// Count returns the row count for collection. Convenience for tests/ops.
func (h *SQLiteHooks) Count(ctx context.Context, collection string) (int, error) {
	if h == nil || h.DB == nil {
		return 0, nil
	}
	var n int
	err := h.DB.QueryRowContext(ctx, `SELECT count(*) FROM kv_documents WHERE collection = ?`, collection).Scan(&n)
	return n, err
}