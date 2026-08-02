package server_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

// First-screen GETs that must not 404 when VITE_USE_MOCK=false.
func TestPageSmokeGETs(t *testing.T) {
	h := server.New(store.New()).Handler()
	paths := []string{
		"/api/workspaces",
		"/api/access/governance",
		"/api/zero-trust/overview",
		"/api/zero-trust/policies",
		"/api/audit-center",
		"/api/home/extra",
		"/api/home/team",
		"/api/home/alerts",
		"/api/operations/overview",
		"/api/digital-employees",
		"/api/digital-employees/overview",
		"/api/digital-employee-templates",
		"/api/digital-employee-capability-catalog",
		"/api/tasks",
		"/api/model-providers",
		"/api/model-routing/policies",
		"/api/model-governance/overview",
		"/api/model-audit",
		"/api/channel-control/deployments",
		"/api/channel-control/policies",
		"/api/channel-control/overview",
		"/api/sessions",
		"/api/slash-commands",
		"/api/conversations/conv-1",
		"/api/knowledge/docs",
		"/api/knowledge/packages",
		"/api/workflows",
		"/api/workflow-templates",
		"/api/skills",
		"/api/skills/catalog",
		"/api/skills/governance/overview",
		"/api/memory/overview",
		"/api/memory/records",
		"/api/billing",
		"/api/backups",
		"/api/notification-channels",
		"/api/tenant/profile",
		"/api/api-keys",
		"/api/webhooks-config",
	}
	for _, p := range paths {
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, p, nil)
		req.Header.Set("Authorization", "Bearer mock-admin-token")
		req.Header.Set("x-workspace-id", "w1")
		h.ServeHTTP(rr, req)
		if rr.Code == http.StatusNotFound {
			t.Fatalf("%s returned 404: %s", p, rr.Body.String())
		}
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status %d: %s", p, rr.Code, rr.Body.String())
		}
	}
}

func TestAcknowledgeAndTransition(t *testing.T) {
	h := server.New(store.New()).Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/home/alerts/alert-1/acknowledge", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("acknowledge %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/tasks/task-1/transition", bytes.NewBufferString(`{"stage":"completed"}`))
	req.Header.Set("Authorization", "Bearer mock-user-token")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("transition %d %s", rr.Code, rr.Body.String())
	}
}
