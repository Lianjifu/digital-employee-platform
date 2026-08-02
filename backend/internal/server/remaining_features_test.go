package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
	"github.com/digital-employee-platform/backend/internal/vault"
)

func TestOIDCStubCallback(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/oidc/login", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("login %d %s", rr.Code, rr.Body.String())
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/auth/oidc/callback?code=admin&state=t1", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("callback %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	_ = json.Unmarshal(rr.Body.Bytes(), &env)
	if env.Data.Token == "" {
		t.Fatalf("missing token: %s", rr.Body.String())
	}
}

func TestModelProviderTestResolvesVault(t *testing.T) {
	st := store.New()
	srv := server.New(st)
	srv.Vault = vault.NewFromEnv()
	ref := "vault:secret/data/models/test-1"
	if err := srv.Vault.Put(context.Background(), ref, "sk-live"); err != nil {
		t.Fatal(err)
	}
	st.Lock()
	st.ModelProviders = append([]map[string]any{{
		"id": "mp-vault", "workspaceId": "w1", "name": "v", "status": "draft", "credentialRef": ref,
	}}, st.ModelProviders...)
	st.Unlock()

	h := srv.Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/model-providers/mp-vault/test", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("test %d %s", rr.Code, rr.Body.String())
	}
	if !bytes.Contains(rr.Body.Bytes(), []byte(`"credentialResolved":true`)) {
		t.Fatalf("expected credentialResolved: %s", rr.Body.String())
	}
}
