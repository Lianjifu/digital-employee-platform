package server_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func TestRAGPublishedOnly(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/knowledge/retrieve", bytes.NewBufferString(`{"query":"发布"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("retrieve %d %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	if strings.Contains(body, "发布检查清单") {
		t.Fatalf("unpublished doc leaked into retrieve: %s", body)
	}
}

func TestConnectRagRetrieve(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/connect/de.rag.v1.RagService/Retrieve",
		bytes.NewBufferString(`{"query":"缓存","correlationId":"corr-test-1"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("connect rag %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		OK   bool `json:"ok"`
		Data struct {
			CorrelationID string `json:"correlationId"`
			Results       []any  `json:"results"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil || !env.OK {
		t.Fatalf("envelope %s", rr.Body.String())
	}
	if env.Data.CorrelationID != "corr-test-1" {
		t.Fatalf("missing correlationId: %s", rr.Body.String())
	}
}

func TestModelRouteRestrictedEgressDenied(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/model-routing/policies",
		bytes.NewBufferString(`{"name":"bad","dataScope":"restricted","egressAllowed":true,"budgetLimitUsd":10}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 403 {
		t.Fatalf("expected 403 egress blocked, got %d %s", rr.Code, rr.Body.String())
	}
}

func TestCopilotStreamStages(t *testing.T) {
	h := server.New(store.New()).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/copilot/conversations/conv-1/stream",
		bytes.NewBufferString(`{"content":"hello","correlationId":"corr-stream-1"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("stream %d %s", rr.Code, rr.Body.String())
	}
	body := rr.Body.String()
	for _, stage := range []string{"policy", "employee", "rag", "runtime", "meter"} {
		if !strings.Contains(body, stage) {
			t.Fatalf("missing stage %s in SSE: %s", stage, body)
		}
	}
	if !strings.Contains(body, "corr-stream-1") {
		t.Fatalf("missing correlationId in SSE")
	}
}
