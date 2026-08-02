package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func TestPhaseACriticalPath(t *testing.T) {
	h := server.New(store.New()).Handler()

	loginBody := `{"email":"admin@acme.com","password":"x"}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewBufferString(loginBody))
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("login status %d body %s", rr.Code, rr.Body.String())
	}
	var loginResp struct {
		OK   bool `json:"ok"`
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &loginResp); err != nil || !loginResp.OK || loginResp.Data.Token == "" {
		t.Fatalf("login envelope: %s", rr.Body.String())
	}
	token := loginResp.Data.Token

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("workspaces %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/zero-trust/evaluate", bytes.NewBufferString(`{"resource":"workflow","action":"publish"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("evaluate %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/audit-center", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("audit %d %s", rr.Code, rr.Body.String())
	}
}

func TestAuditorWriteForbidden(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/workspaces", bytes.NewBufferString(`{"name":"x"}`))
	req.Header.Set("Authorization", "Bearer mock-auditor-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Fatalf("expected 403 got %d %s", rr.Code, rr.Body.String())
	}
}

func TestSODSelfApproval(t *testing.T) {
	h := server.New(store.New()).Handler()
	// user submits employee; same user cannot approve
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/digital-employees/de-2/approve", nil)
	req.Header.Set("Authorization", "Bearer mock-user-token")
	h.ServeHTTP(rr, req)
	// user lacks release.approve → 403 role; use admin who is also owner of de-1
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/digital-employees/de-1/approve", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Fatalf("expected SOD 403 got %d %s", rr.Code, rr.Body.String())
	}
}
