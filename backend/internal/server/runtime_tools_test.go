package server

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestRunRuntimeToolWriteFileRoutesToPilotdeck(t *testing.T) {
	pkg := t.TempDir()
	if err := os.MkdirAll(filepath.Join(pkg, ".copilot-ws"), 0o755); err != nil {
		t.Fatal(err)
	}
	s := &Server{Store: store.NewEmpty()}
	s.Store.Skills = []map[string]any{{
		"id": "sk-pptx", "workspaceId": "w1", "name": "pptx", "kind": "skill",
		"packagePath": pkg, "status": "installed", "producesArtifacts": true,
	}}
	ctx := toolRunContext{
		Request:     httptest.NewRequest("POST", "/api/copilot/conversations/c1/stream", nil),
		WorkspaceID: "w1",
	}
	tool := &registeredTool{Name: "write_file", Kind: "tool", Key: "tool:write_file"}
	call := toolCallRequest{Name: "write_file", Args: map[string]any{
		"path": ".copilot-ws/team_quarterly_review_ppt.mjs", "content": "console.log(1)",
	}}
	res := s.runRuntimeTool(ctx, tool, call, time.Now())
	if res.Status != "success" {
		t.Fatalf("write_file status=%s err=%s output=%s", res.Status, res.Error, res.Output)
	}
	if !strings.Contains(res.Output, "下一步可用 action=run command=.copilot-ws/team_quarterly_review_ppt.mjs") {
		t.Fatalf("expected next-run hint, got %s", res.Output)
	}
	if _, err := os.Stat(filepath.Join(pkg, ".copilot-ws", "team_quarterly_review_ppt.mjs")); err != nil {
		t.Fatalf("script not written: %v", err)
	}
}

func TestSandboxCopilotWsPaths(t *testing.T) {
	if !isSandboxCopilotWsPath(".copilot-ws/gen.mjs") {
		t.Fatal("expected .copilot-ws path")
	}
	if !isSandboxCopilotWsPath("node .copilot-ws/gen.mjs") {
		t.Fatal("expected node-prefixed path")
	}
	if isSandboxCopilotWsPath("scripts/thumbnail.py") {
		t.Fatal("scripts/ should not be treated as sandbox-ws for write exemption alone")
	}
}

func TestSandboxArtifactSkillInvocationCopilotWs(t *testing.T) {
	tool := &registeredTool{Name: "pptx", Kind: "skill"}
	sk := map[string]any{"name": "pptx", "producesArtifacts": true}
	writeCall := toolCallRequest{Name: "pptx", Args: map[string]any{
		"action": "write", "path": ".copilot-ws/gen.mjs", "content": "x",
	}}
	if !isSandboxArtifactSkillInvocation(tool, sk, writeCall, skillActionWrite) {
		t.Fatal("pptx write to .copilot-ws should be sandbox")
	}
	runCall := toolCallRequest{Name: "pptx", Args: map[string]any{
		"action": "run", "command": ".copilot-ws/gen.mjs",
	}}
	if !isSandboxArtifactSkillInvocation(tool, sk, runCall, skillActionRun) {
		t.Fatal("pptx run of .copilot-ws script should be sandbox")
	}
	if skillInvocationNeedsApproval(sessionModeExecute, tool, sk, runCall) {
		t.Fatal("sandbox pptx run should not need approval")
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
