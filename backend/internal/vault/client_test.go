package vault

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPutResolveStub(t *testing.T) {
	c := &Client{stub: map[string]string{}, http: http.DefaultClient}
	ref := "vault:secret/data/models/x"
	if err := c.Put(context.Background(), ref, "sk-secret"); err != nil {
		t.Fatal(err)
	}
	v, err := c.Resolve(context.Background(), ref)
	if err != nil || v != "sk-secret" {
		t.Fatalf("got %q %v", v, err)
	}
}

func TestResolveVaultKVv2(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/secret/data/models/a", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "tok" {
			http.Error(w, "denied", 403)
			return
		}
		if r.Method == http.MethodPost {
			w.WriteHeader(204)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"data": map[string]any{"value": "from-vault"}},
		})
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	c := &Client{addr: ts.URL, token: "tok", mount: "secret", http: ts.Client(), stub: map[string]string{}}
	ref := "vault:secret/data/models/a"
	v, err := c.Resolve(context.Background(), ref)
	if err != nil || v != "from-vault" {
		t.Fatalf("got %q %v", v, err)
	}
	if err := c.Put(context.Background(), ref, "written"); err != nil {
		t.Fatal(err)
	}
}

func TestInvalidRef(t *testing.T) {
	c := NewFromEnv()
	if _, err := c.Resolve(context.Background(), "plain"); err == nil {
		t.Fatal("expected invalid ref")
	}
}
