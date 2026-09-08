package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/digital-employee-platform/backend/internal/metrics"
	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func newSessionSyncHandler(t *testing.T) http.Handler {
	t.Helper()
	t.Setenv("DE_ENV", "test")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	return server.New(store.New()).Handler()
}

func TestSessionSyncSkewIngestHappyPath(t *testing.T) {
	countBefore, sumBefore, maxBefore := metrics.Global.SessionSync.Snapshot()

	body := strings.NewReader(`{"skewMs": 42}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	data, _ := resp["data"].(map[string]any)
	if data == nil {
		t.Fatalf("missing data envelope: %v", resp)
	}
	if recorded, _ := data["recorded"].(bool); !recorded {
		t.Fatalf("expected recorded:true, got %v", data)
	}

	count, sum, max := metrics.Global.SessionSync.Snapshot()
	if count-countBefore != 1 {
		t.Fatalf("expected count delta 1, got %d", count-countBefore)
	}
	if sum-sumBefore != 42 {
		t.Fatalf("expected sum delta 42, got %d", sum-sumBefore)
	}
	if max < maxBefore+42 {
		t.Fatalf("expected max to advance to >=%d, got %d (was %d)", maxBefore+42, max, maxBefore)
	}
}

func TestSessionSyncSkewIngestNegativeNormalised(t *testing.T) {
	countBefore, _, _ := metrics.Global.SessionSync.Snapshot()

	body := strings.NewReader(`{"skewMs": -17}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	count, _, _ := metrics.Global.SessionSync.Snapshot()
	if count-countBefore != 1 {
		t.Fatalf("expected count delta 1, got %d", count-countBefore)
	}
}

func TestSessionSyncSkewIngestMissingField(t *testing.T) {
	body := strings.NewReader(`{}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestSessionSyncSkewIngestOutOfRange(t *testing.T) {
	body := strings.NewReader(`{"skewMs": 99999999999}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestSessionSyncSkewIngestNonNumeric(t *testing.T) {
	body := strings.NewReader(`{"skewMs": "lots"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rr.Code, rr.Body.String())
	}
}