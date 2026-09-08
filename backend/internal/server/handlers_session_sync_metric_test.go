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
	countBefore, sumBefore, maxBefore, _ := metrics.Global.SessionSync.Snapshot()

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

	count, sum, max, _ := metrics.Global.SessionSync.Snapshot()
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
	countBefore, _, _, _ := metrics.Global.SessionSync.Snapshot()

	body := strings.NewReader(`{"skewMs": -17}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	count, _, _, _ := metrics.Global.SessionSync.Snapshot()
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

func TestSessionSyncSkewAcceptedWhenEnabled(t *testing.T) {
	// Default env (no DE_SESSION_SYNC_ENABLED) → ingest succeeds.
	countBefore, _, _, rejectedBefore := metrics.Global.SessionSync.Snapshot()

	body := strings.NewReader(`{"skewMs": 7}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rr.Code, rr.Body.String())
	}
	count, _, _, rejected := metrics.Global.SessionSync.Snapshot()
	if count-countBefore != 1 {
		t.Fatalf("expected count delta 1, got %d", count-countBefore)
	}
	if rejected-rejectedBefore != 0 {
		t.Fatalf("expected no rejected delta, got %d", rejected-rejectedBefore)
	}
}

func TestSessionSyncSkewRejectedWhenDisabled(t *testing.T) {
	_, _, _, rejectedBefore := metrics.Global.SessionSync.Snapshot()
	countBefore, _, _, _ := metrics.Global.SessionSync.Snapshot()

	t.Setenv("DE_SESSION_SYNC_ENABLED", "false")
	body := strings.NewReader(`{"skewMs": 11}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rr.Code, rr.Body.String())
	}
	count, _, _, rejected := metrics.Global.SessionSync.Snapshot()
	if count-countBefore != 0 {
		t.Fatalf("expected no accepted delta, got %d", count-countBefore)
	}
	if rejected-rejectedBefore != 1 {
		t.Fatalf("expected rejected delta 1, got %d", rejected-rejectedBefore)
	}
}

func TestSessionSyncRejectionEnvelope(t *testing.T) {
	t.Setenv("DE_SESSION_SYNC_ENABLED", "false")
	body := strings.NewReader(`{"skewMs": 5}`)
	req := httptest.NewRequest(http.MethodPost, "/api/metrics/session-sync-skew", body)
	rr := httptest.NewRecorder()
	newSessionSyncHandler(t).ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rr.Code, rr.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if ok, _ := resp["ok"].(bool); ok {
		t.Fatalf("expected ok=false, got %v", resp)
	}
	errBody, ok := resp["error"].(map[string]any)
	if !ok {
		t.Fatalf("missing error body: %v", resp)
	}
	if code, _ := errBody["code"].(string); code != "E_SESSION_SYNC_DISABLED" {
		t.Fatalf("expected code=E_SESSION_SYNC_DISABLED, got %q", code)
	}
	msg, _ := errBody["message"].(string)
	if !strings.Contains(msg, "DE_SESSION_SYNC_ENABLED") {
		t.Fatalf("expected message to mention DE_SESSION_SYNC_ENABLED, got %q", msg)
	}
}