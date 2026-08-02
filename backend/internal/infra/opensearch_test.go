package infra

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenSearchIndexAndSearch(t *testing.T) {
	var indexed map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodPut && strings.HasSuffix(r.URL.Path, "/de-audit") && !strings.Contains(r.URL.Path, "_doc"):
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"acknowledged":true}`))
		case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/_doc/"):
			b, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(b, &indexed)
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"result":"created"}`))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/_search"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"hits": map[string]any{
					"hits": []map[string]any{
						{"_source": map[string]any{
							"id": "a1", "workspaceId": "ws1", "action": "login", "time": "2026-01-01T00:00:00Z",
						}},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	o := &OpenSearchAudit{Base: srv.URL, Index: "de-audit", HTTP: srv.Client()}
	if err := o.EnsureIndex(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := o.IndexEvent(context.Background(), map[string]any{
		"id": "a1", "workspaceId": "ws1", "action": "login",
	}); err != nil {
		t.Fatal(err)
	}
	if indexed["id"] != "a1" {
		t.Fatalf("indexed=%v", indexed)
	}
	rows, err := o.SearchRecent(context.Background(), []string{"ws1"}, 10)
	if err != nil || len(rows) != 1 || str(rows[0]["id"]) != "a1" {
		t.Fatalf("search rows=%v err=%v", rows, err)
	}
}

func TestNewOpenSearchAuditFromEnvEmpty(t *testing.T) {
	t.Setenv("DE_OPENSEARCH_URL", "")
	if NewOpenSearchAuditFromEnv() != nil {
		t.Fatal("expected nil without URL")
	}
}
