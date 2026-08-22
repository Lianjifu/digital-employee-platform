package server

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/digital-employee-platform/backend/internal/store"
)

func TestRunRuntimeToolDoesNotRecurse(t *testing.T) {
	pkg := t.TempDir()
	if err := os.WriteFile(filepath.Join(pkg, "SKILL.md"), []byte("# docx skill"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := &Server{Store: store.NewEmpty()}
	s.Store.Skills = []map[string]any{{
		"id": "sk-docx", "workspaceId": "w1", "name": "docx", "kind": "skill",
		"packagePath": pkg, "status": "installed",
	}}
	ctx := toolRunContext{
		Request:     httptest.NewRequest("POST", "/api/copilot/conversations/c1/stream", nil),
		WorkspaceID: "w1",
	}
	tool := &registeredTool{Name: "read_file", Kind: "tool", Key: "tool:read_file"}
	call := toolCallRequest{Name: "read_file", Args: map[string]any{"path": "SKILL.md"}}

	res := s.runRuntimeTool(ctx, tool, call, time.Now())
	if res.Status != "success" {
		t.Fatalf("read_file status=%s output=%s err=%s", res.Status, res.Output, res.Error)
	}
}

func TestRunPilotdeckToolReadFileDoesNotRecurse(t *testing.T) {
	pkg := t.TempDir()
	if err := os.WriteFile(filepath.Join(pkg, "SKILL.md"), []byte("# docx skill"), 0o644); err != nil {
		t.Fatal(err)
	}
	s := &Server{Store: store.NewEmpty()}
	s.Store.Skills = []map[string]any{{
		"id": "sk-docx", "workspaceId": "w1", "name": "docx", "kind": "skill",
		"packagePath": pkg, "status": "installed",
	}}
	ctx := toolRunContext{
		Request:     httptest.NewRequest("POST", "/api/copilot/conversations/c1/stream", nil),
		WorkspaceID: "w1",
	}
	tool := &registeredTool{Name: "read_file", Kind: "tool", Key: "tool:read_file"}
	call := toolCallRequest{Name: "read_file", Args: map[string]any{"path": "SKILL.md"}}

	res := s.runPilotdeckTool(ctx, tool, call, time.Now())
	if res.Status != "success" {
		t.Fatalf("read_file status=%s output=%s err=%s", res.Status, res.Output, res.Error)
	}
}
