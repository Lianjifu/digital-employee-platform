package server_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/dingtalk"
	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
	"github.com/digital-employee-platform/backend/internal/vault"
)

func TestDingtalkWebhookReusesSessionForSameConversation(t *testing.T) {
	st := store.New()
	srv := server.New(st)
	srv.Vault = vault.NewFromEnv()
	h := srv.Handler()

	cred := dingtalk.Credentials{ClientID: "ding_x", ClientSecret: "SEC123"}.Normalize()
	payload, _ := cred.Marshal()
	if err := srv.Vault.Put(context.Background(), "vault://channel-deployments/dep-ding-route/credential", payload); err != nil {
		t.Fatal(err)
	}
	st.Lock()
	st.ChannelDeploys = append([]map[string]any{{
		"id": "dep-ding-route", "workspaceId": "w1", "name": "钉钉路由", "kind": "dingtalk",
		"status": "active", "credentialRef": "vault://channel-deployments/dep-ding-route/credential",
		"connectionMode": "webhook", "digitalEmployeeId": "de-1",
		"webhookPath": "/api/channel/dingtalk/events/dep-ding-route",
	}}, st.ChannelDeploys...)
	st.Unlock()

	post := func(msgID, text string) {
		t.Helper()
		ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
		mac := hmac.New(sha256.New, []byte(cred.ClientSecret))
		_, _ = mac.Write([]byte(ts + "\n" + cred.ClientSecret))
		sign := base64.StdEncoding.EncodeToString(mac.Sum(nil))
		body := `{"msgId":"` + msgID + `","conversationId":"cid_route_1","conversationType":"1","senderStaffId":"staff1","text":{"content":"` + text + `"}}`
		rr := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/channel/dingtalk/events/dep-ding-route", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("timestamp", ts)
		req.Header.Set("sign", sign)
		h.ServeHTTP(rr, req)
		if rr.Code != 200 {
			t.Fatalf("webhook %s %d %s", msgID, rr.Code, rr.Body.String())
		}
	}
	post("d-101", "first inbound")
	post("d-102", "second inbound")
	post("d-101", "duplicate event")
	if n := countChannelSessions(st, "dingtalk", "cid_route_1"); n != 1 {
		t.Fatalf("want 1 session for dingtalk conversation, got %d", n)
	}
}

func TestProductionHighRiskEmployeeRequiresCountersign(t *testing.T) {
	t.Setenv("DE_ENV", "production")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	st := store.New()
	st.Lock()
	for _, e := range st.Employees {
		if strAny(e["id"]) == "de-2" {
			e["risk"] = "high"
		}
	}
	st.Unlock()
	h := server.New(st).Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/digital-employees/de-2/approve", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("first approve %d %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "pending_countersign") {
		t.Fatalf("want pending_countersign: %s", rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/digital-employees/de-2/approve", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("same admin must not countersign: %s", rr.Body.String())
	}

	tok, err := auth.Sign(auth.Identity{
		ID: "u4", Name: "第二管理员", Role: "admin", TenantID: "tenant-acme",
		WorkspaceID: "w1", WorkspaceIDs: []string{"w1"},
		EnvironmentScopes: []string{"sandbox", "staging", "production"},
		Permissions:       auth.RolePermissions("admin"),
	}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/digital-employees/de-2/approve", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("countersign %d %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"lifecycle":"active"`) {
		t.Fatalf("expected active: %s", rr.Body.String())
	}
}

func TestProductionEvalSetGateBlocksKnowledgePublish(t *testing.T) {
	t.Setenv("DE_ENV", "production")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	h := server.New(store.New()).Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/knowledge/packages", bytes.NewBufferString(`{"name":"无评测包"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	pkgID, _ := env.Data["id"].(string)
	if pkgID == "" {
		t.Fatalf("missing pkg id: %s", rr.Body.String())
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/knowledge/packages/"+pkgID+"/publish", bytes.NewBufferString(`{}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("must require eval set: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "E_EVAL_SET_REQUIRED") && !strings.Contains(rr.Body.String(), "评测") {
		t.Fatalf("want eval gate: %s", rr.Body.String())
	}
}

func TestProductionEvolveApproveRequiresSoD(t *testing.T) {
	t.Setenv("DE_ENV", "production")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	st := store.New()
	st.Lock()
	st.EvolveCands = append(st.EvolveCands, map[string]any{
		"id": "evolve-sod-1", "workspaceId": "w1",
		"kind": "memory_promote", "status": "pending_review",
		"title": "偏好", "createdBy": "平台管理员", "createdById": "u1",
		"payload": map[string]any{"targetLayer": "working", "title": "x", "content": "y"},
	})
	st.Unlock()
	h := server.New(st).Handler()
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/evolve/candidates/evolve-sod-1/approve", strings.NewReader("{}"))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("self approve must fail: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "E_SOD_SELF_APPROVAL") {
		t.Fatalf("want SOD: %s", rr.Body.String())
	}
}

func TestReplicaStandbyRejectsWrites(t *testing.T) {
	t.Setenv("DE_REPLICA_MODE", "standby")
	t.Setenv("DE_INSTANCE_ID", "node-b")
	h := server.New(store.New()).Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), `"replica":"standby"`) {
		t.Fatalf("healthz %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/api/digital-employees", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("standby GET %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/workflows", bytes.NewBufferString(`{"name":"x"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("standby must reject writes: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "E_REPLICA_STANDBY") {
		t.Fatalf("want E_REPLICA_STANDBY: %s", rr.Body.String())
	}
}

func TestReplicaForcedRejectsWrites(t *testing.T) {
	srv := server.New(store.New())
	srv.ReplicaForced = true
	srv.PostgresRecovery = true
	h := srv.Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), `"replica":"standby"`) || !strings.Contains(rr.Body.String(), `"postgresRecovery":true`) {
		t.Fatalf("readyz %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/workflows", bytes.NewBufferString(`{"name":"x"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 || !strings.Contains(rr.Body.String(), "E_REPLICA_STANDBY") {
		t.Fatalf("recovery-forced standby must reject writes: %s", rr.Body.String())
	}
}

func TestProductionRestrictedRoutingRequiresCountersign(t *testing.T) {
	t.Setenv("DE_ENV", "production")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	h := server.New(store.New()).Handler()

	adminHdr := func(req *http.Request, tok string) {
		req.Header.Set("Authorization", "Bearer "+tok)
		req.Header.Set("X-Workspace-Id", "w1")
		req.Header.Set("Content-Type", "application/json")
	}
	secondTok, err := auth.Sign(auth.Identity{
		ID: "u4", Name: "第二管理员", Role: "admin", TenantID: "tenant-acme",
		WorkspaceID: "w1", WorkspaceIDs: []string{"w1"},
		EnvironmentScopes: []string{"sandbox", "staging", "production"},
		Permissions:       auth.RolePermissions("admin"),
	}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	thirdTok, err := auth.Sign(auth.Identity{
		ID: "u5", Name: "第三管理员", Role: "admin", TenantID: "tenant-acme",
		WorkspaceID: "w1", WorkspaceIDs: []string{"w1"},
		EnvironmentScopes: []string{"sandbox", "staging", "production"},
		Permissions:       auth.RolePermissions("admin"),
	}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/model-routing/policies", bytes.NewBufferString(
		`{"level":"P4","primaryModelId":"mdl-gpt4","dataScope":"restricted","egressAllowed":false,"budgetLimitUsd":80}`))
	adminHdr(req, "mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("create %d %s", rr.Code, rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	pid, _ := env.Data["id"].(string)
	if pid == "" {
		t.Fatalf("missing policy id: %s", rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/validate", bytes.NewBufferString(`{}`))
	adminHdr(req, "mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("validate %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/publish", bytes.NewBufferString(`{}`))
	adminHdr(req, "mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), `"status":"pending_approval"`) {
		t.Fatalf("first publish want pending_approval: %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/publish", bytes.NewBufferString(`{}`))
	adminHdr(req, "mock-admin-token")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("self publish must fail: %s", rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/publish", bytes.NewBufferString(`{}`))
	adminHdr(req, secondTok)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), "pending_countersign") {
		t.Fatalf("want pending_countersign: %d %s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/publish", bytes.NewBufferString(`{}`))
	adminHdr(req, secondTok)
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("same first approver must not countersign: %s", rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/model-routing/policies/"+pid+"/publish", bytes.NewBufferString(`{}`))
	adminHdr(req, thirdTok)
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("countersign %d %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"published"`) && !strings.Contains(rr.Body.String(), `"policyId"`) {
		t.Fatalf("want published version: %s", rr.Body.String())
	}
}

func TestProductionWorkflowSkillPublishRequiresSoD(t *testing.T) {
	t.Setenv("DE_ENV", "production")
	t.Setenv("DE_ALLOW_MOCK_IDENTITY", "true")
	st := store.New()
	h := server.New(st).Handler()

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/workflows/wf1/publish-as-skill", bytes.NewBufferString(`{"name":"待批流程技能"}`))
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("publish-as-skill %d %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "pending_approval") {
		t.Fatalf("want pending_approval: %s", rr.Body.String())
	}
	var env struct {
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	sid, _ := env.Data["id"].(string)
	if sid == "" {
		t.Fatalf("missing skill id: %s", rr.Body.String())
	}

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/workflow-skills/"+sid+"/publish", nil)
	req.Header.Set("Authorization", "Bearer mock-admin-token")
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code == 200 {
		t.Fatalf("self approve must fail: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "E_SOD_SELF_APPROVAL") {
		t.Fatalf("want SOD: %s", rr.Body.String())
	}

	tok, err := auth.Sign(auth.Identity{
		ID: "u4", Name: "第二管理员", Role: "admin", TenantID: "tenant-acme",
		WorkspaceID: "w1", WorkspaceIDs: []string{"w1"},
		EnvironmentScopes: []string{"sandbox", "staging", "production"},
		Permissions:       auth.RolePermissions("admin"),
	}, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/workflow-skills/"+sid+"/publish", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("X-Workspace-Id", "w1")
	h.ServeHTTP(rr, req)
	if rr.Code != 200 {
		t.Fatalf("approve %d %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"published"`) {
		t.Fatalf("want published: %s", rr.Body.String())
	}

	st.RLock()
	defer st.RUnlock()
	foundEnabled := false
	for _, sk := range st.Skills {
		if strAny(sk["id"]) == sid && strAny(sk["lifecycleStatus"]) == "enabled" {
			foundEnabled = true
			break
		}
	}
	if !foundEnabled {
		t.Fatal("approved workflow skill must be catalog-enabled")
	}
}
