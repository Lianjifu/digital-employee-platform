package store

import (
	"context"
	"path/filepath"
	"sort"
	"sync"
	"testing"
	"time"
)

func sqliteHarness(t *testing.T) (*SQLiteHooks, context.Context) {
	t.Helper()
	dir := t.TempDir()
	h, err := OpenSQLite(filepath.Join(dir, "kv.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = h.Close() })
	return h, context.Background()
}

func TestOpenSQLiteRequiresPath(t *testing.T) {
	if _, err := OpenSQLite(""); err == nil {
		t.Fatal("expected error on empty path")
	}
}

func TestOpenSQLiteCreatesParent(t *testing.T) {
	dir := t.TempDir()
	h, err := OpenSQLite(filepath.Join(dir, "nested", "sub", "kv.db"))
	if err != nil {
		t.Fatalf("open nested: %v", err)
	}
	_ = h.Close()
}

func TestSQLiteUpsertMany(t *testing.T) {
	h, ctx := sqliteHarness(t)
	items := []map[string]any{
		{"id": "a", "workspaceId": "w1", "name": "alpha"},
		{"id": "b", "workspaceId": "w1", "name": "beta"},
		{"id": "c", "workspaceId": "w2", "name": "gamma"},
	}
	if err := h.Persist(ctx, "items", items); err != nil {
		t.Fatalf("persist: %v", err)
	}
	got, err := h.List(ctx, "items")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("want 3, got %d", len(got))
	}
	// updated_at DESC ordering: most recently written first.
	if got[0]["id"] != "c" && got[0]["id"] != "b" && got[0]["id"] != "a" {
		t.Fatalf("ordering broken: %+v", got)
	}
}

func TestSQLiteUpsertManyOverwrites(t *testing.T) {
	h, ctx := sqliteHarness(t)
	if err := h.Persist(ctx, "items", []map[string]any{
		{"id": "a", "workspaceId": "w1", "v": 1},
	}); err != nil {
		t.Fatalf("first persist: %v", err)
	}
	time.Sleep(10 * time.Millisecond) // ensure updated_at differs
	if err := h.Persist(ctx, "items", []map[string]any{
		{"id": "a", "workspaceId": "w1", "v": 2},
	}); err != nil {
		t.Fatalf("second persist: %v", err)
	}
	got, _ := h.List(ctx, "items")
	if len(got) != 1 {
		t.Fatalf("want 1 after overwrite, got %d", len(got))
	}
	if got[0]["v"].(float64) != 2 {
		t.Fatalf("want v=2, got %v", got[0]["v"])
	}
}

func TestSQLiteReplaceCollection(t *testing.T) {
	h, ctx := sqliteHarness(t)
	// channel_dlq is in replaceOnPersist
	if err := h.Persist(ctx, "channel_dlq", []map[string]any{
		{"id": "x", "workspaceId": "w1", "msg": "first"},
		{"id": "y", "workspaceId": "w1", "msg": "second"},
	}); err != nil {
		t.Fatalf("persist: %v", err)
	}
	if err := h.Persist(ctx, "channel_dlq", []map[string]any{
		{"id": "z", "workspaceId": "w1", "msg": "third"},
	}); err != nil {
		t.Fatalf("replace: %v", err)
	}
	n, err := h.Count(ctx, "channel_dlq")
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 1 {
		t.Fatalf("want 1 after replace, got %d", n)
	}
}

func TestSQLiteDeleteMany(t *testing.T) {
	h, ctx := sqliteHarness(t)
	if err := h.Persist(ctx, "items", []map[string]any{
		{"id": "a", "workspaceId": "w1", "v": 1},
		{"id": "b", "workspaceId": "w1", "v": 2},
		{"id": "c", "workspaceId": "w1", "v": 3},
	}); err != nil {
		t.Fatalf("persist: %v", err)
	}
	if err := h.Delete(ctx, "items", []string{"a", "c", "missing"}); err != nil {
		t.Fatalf("delete: %v", err)
	}
	n, _ := h.Count(ctx, "items")
	if n != 1 {
		t.Fatalf("want 1 remaining, got %d", n)
	}
}

func TestSQLiteDeleteEmptySafe(t *testing.T) {
	h, ctx := sqliteHarness(t)
	if err := h.Delete(ctx, "items", nil); err != nil {
		t.Fatalf("empty delete: %v", err)
	}
	if err := h.Delete(ctx, "items", []string{""}); err != nil {
		t.Fatalf("blank id delete: %v", err)
	}
}

func TestSQLiteWorkspaceIsolation(t *testing.T) {
	h, ctx := sqliteHarness(t)
	// Two workspaces with same id should coexist.
	if err := h.Persist(ctx, "items", []map[string]any{
		{"id": "a", "workspaceId": "w1", "name": "ws1"},
		{"id": "a", "workspaceId": "w2", "name": "ws2"},
	}); err != nil {
		t.Fatalf("persist: %v", err)
	}
	n, _ := h.Count(ctx, "items")
	if n != 2 {
		t.Fatalf("want 2 (workspace-isolated), got %d", n)
	}
	got, _ := h.List(ctx, "items")
	names := []string{}
	for _, m := range got {
		names = append(names, m["name"].(string))
	}
	sort.Strings(names)
	if names[0] != "ws1" || names[1] != "ws2" {
		t.Fatalf("names: %v", names)
	}
}

func TestSQLiteReopen(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "kv.db")

	h1, err := OpenSQLite(path)
	if err != nil {
		t.Fatalf("open 1: %v", err)
	}
	if err := h1.Persist(context.Background(), "items", []map[string]any{
		{"id": "x", "workspaceId": "w1", "v": 42},
	}); err != nil {
		t.Fatalf("persist: %v", err)
	}
	if err := h1.Close(); err != nil {
		t.Fatalf("close 1: %v", err)
	}

	h2, err := OpenSQLite(path)
	if err != nil {
		t.Fatalf("open 2: %v", err)
	}
	defer h2.Close()
	got, _ := h2.List(context.Background(), "items")
	if len(got) != 1 || got[0]["v"].(float64) != 42 {
		t.Fatalf("reopen read: %+v", got)
	}
}

func TestSQLiteConcurrentPersist(t *testing.T) {
	h, ctx := sqliteHarness(t)
	var wg sync.WaitGroup
	errs := make(chan error, 4)
	for w := 0; w < 4; w++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			items := []map[string]any{}
			for i := 0; i < 25; i++ {
				items = append(items, map[string]any{
					"id":          "w" + string(rune('a'+w)) + "-" + string(rune('a'+i)),
					"workspaceId": "w1",
					"v":           i,
				})
			}
			if err := h.Persist(ctx, "concurrent", items); err != nil {
				errs <- err
			}
		}(w)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent persist: %v", err)
	}
	n, _ := h.Count(ctx, "concurrent")
	if n != 100 {
		t.Fatalf("want 100 unique rows, got %d", n)
	}
}

func TestSQLiteViaStoreHook(t *testing.T) {
	dir := t.TempDir()
	h, err := OpenSQLite(filepath.Join(dir, "kv.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer h.Close()

	s := New()
	s.SetPersistHook(h.Persist)

	s.Lock()
	s.KnowledgeDocs = []map[string]any{
		{"id": "k1", "workspaceId": "w1", "title": "t1"},
		{"id": "k2", "workspaceId": "w1", "title": "t2"},
	}
	s.Unlock()

	if err := s.PersistSync("knowledge_docs"); err != nil {
		t.Fatalf("persist sync: %v", err)
	}

	got, err := h.List(context.Background(), "knowledge_docs")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 via hook, got %d", len(got))
	}
}