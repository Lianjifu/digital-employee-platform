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

func TestEnsureDefaultWorkspace_PreservesExisting(t *testing.T) {
	st := NewEmpty()
	st.Workspaces = []map[string]any{
		{"id": "w-custom", "name": "已有工作区", "tenantId": "tenant-acme", "status": "active"},
	}
	if st.EnsureDefaultWorkspace() {
		t.Fatal("should not overwrite existing workspaces")
	}
	if len(st.Workspaces) != 1 || str(st.Workspaces[0]["id"]) != "w-custom" {
		t.Fatalf("got %#v", st.Workspaces)
	}
}
