package store

import "testing"

func TestEnsureDefaultWorkspace_EmptyCreatesW1(t *testing.T) {
	st := NewEmpty()
	if !st.EnsureDefaultWorkspace() {
		t.Fatal("expected create on empty store")
	}
	if len(st.Workspaces) != 1 {
		t.Fatalf("workspaces=%d", len(st.Workspaces))
	}
	ws := st.Workspaces[0]
	if str(ws["id"]) != DefaultWorkspaceID {
		t.Fatalf("id=%v", ws["id"])
	}
	if str(ws["name"]) != "默认工作区" {
		t.Fatalf("name=%v", ws["name"])
	}
	if st.Quotas[DefaultWorkspaceID] == nil {
		t.Fatal("missing default quota")
	}
	if len(st.Members[DefaultWorkspaceID]) == 0 {
		t.Fatal("missing default member")
	}
	if st.EnsureDefaultWorkspace() {
		t.Fatal("second call should be no-op")
	}
}

func TestEnsureDefaultWorkspace_CreatesW1AlongsideOrphan(t *testing.T) {
	st := NewEmpty()
	st.Workspaces = []map[string]any{
		{"id": "workspace-1", "name": "测试工作区", "tenantId": "tenant-acme", "ownerId": "u1", "status": "active"},
	}
	if !st.EnsureDefaultWorkspace() {
		t.Fatal("expected w1 shell when only orphan workspace exists")
	}
	if len(st.Workspaces) != 2 {
		t.Fatalf("workspaces=%d", len(st.Workspaces))
	}
	if str(st.Workspaces[0]["id"]) != DefaultWorkspaceID {
		t.Fatalf("expected w1 first, got %#v", st.Workspaces[0])
	}
}

func TestRebuildWorkspaceAccessGrants_FromOwner(t *testing.T) {
	st := NewEmpty()
	st.Workspaces = []map[string]any{
		{"id": "workspace-1", "ownerId": "u1", "tenantId": "tenant-acme"},
	}
	st.RebuildWorkspaceAccessGrants()
	got := st.ActorExtraWorkspaces["u1"]
	if len(got) != 1 || got[0] != "workspace-1" {
		t.Fatalf("grants=%v", got)
	}
}
