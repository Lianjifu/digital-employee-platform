package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/store"
)

func TestNormalizeSkillActionAndScriptCommand(t *testing.T) {
	if normalizeSkillAction(map[string]any{"action": "OPEN"}) != skillActionOpen {
		t.Fatal("open")
	}
	if normalizeSkillAction(map[string]any{"action": "run"}) != skillActionRun {
		t.Fatal("run")
	}
	if !looksLikeSkillScriptCommand("scripts/echo.py") {
		t.Fatal("scripts/echo.py")
	}
	if !looksLikeSkillScriptCommand("node .copilot-ws/gen.js --out out.pptx") {
		t.Fatal(".copilot-ws")
	}
	if looksLikeSkillScriptCommand("请生成一份述职PPT") {
		t.Fatal("natural language must not look like script")
	}
}

func TestSkillInvocationNeedsApproval(t *testing.T) {
	tool := &registeredTool{Name: "pptx", Kind: "skill", Key: "skill:pptx", Mode: toolModeRecommend}
	sk := map[string]any{"name": "pptx", "hasScripts": true, "producesArtifacts": true, "readOnly": false}
	callRun := toolCallRequest{Name: "pptx", Args: map[string]any{"action": "run", "command": "scripts/thumbnail.py"}}
	if !skillInvocationNeedsApproval(sessionModeExecute, tool, sk, callRun) {
		t.Fatal("artifact-producing run should need approval in execute")
	}
	callOpen := toolCallRequest{Name: "pptx", Args: map[string]any{"action": "open"}}
	if skillInvocationNeedsApproval(sessionModeExecute, tool, sk, callOpen) {
		t.Fatal("open should not need approval")
	}
	echo := map[string]any{"name": "hello-echo", "hasScripts": true, "producesArtifacts": false, "readOnly": true}
	echoTool := &registeredTool{Name: "hello-echo", Kind: "skill", Key: "skill:hello-echo"}
	if skillInvocationNeedsApproval(sessionModeExecute, echoTool, echo, callRun) {
		t.Fatal("readOnly echo should not need approval")
	}
}

func TestSkillWriteAndOpen(t *testing.T) {
	dir := t.TempDir()
	sk := map[string]any{
		"id": "sk-t", "name": "demo", "packagePath": dir,
		"hasScripts": true, "scripts": []string{"scripts/a.py"},
	}
	enrichSkillMetadata(sk)
	s := &Server{}
	res := s.skillWrite(sk, toolCallRequest{Args: map[string]any{
		"path": "gen.js", "content": "console.log(1)",
	}}, time.Now())
	if res.Status != "success" {
		t.Fatalf("%#v", res)
	}
	written := filepath.Join(dir, ".copilot-ws", "gen.js")
	if _, err := os.Stat(written); err != nil {
		t.Fatal(err)
	}

	tool := &registeredTool{Name: "demo", Kind: "skill", Key: "skill:demo"}
	open := s.skillOpen(toolRunContext{}, tool, sk, time.Now())
	if open.Status != "success" {
		t.Fatalf("%#v", open)
	}
	if !strings.Contains(open.Output, "skill.open") || !strings.Contains(open.Output, "scripts") {
		t.Fatalf("open output: %s", open.Output)
	}
}

func TestSkillRunNeedsInstructionWithoutScript(t *testing.T) {
	s := &Server{}
	sk := map[string]any{
		"id": "sk-t", "name": "pptx", "packagePath": t.TempDir(),
		"hasScripts": true, "scripts": []string{"scripts/thumbnail.py"},
		"producesArtifacts": true,
	}
	tool := &registeredTool{Name: "pptx", Kind: "skill", Key: "skill:pptx"}
	res := s.skillRun(toolRunContext{SessionMode: sessionModeExecute, WorkspaceID: "w1"}, tool, sk, toolCallRequest{
		Args: map[string]any{"action": "run", "command": "请生成PPT"},
	}, "请生成PPT", time.Now())
	if res.Status != "needs_instruction" {
		t.Fatalf("got %s: %s", res.Status, res.Output)
	}
}

func TestInvestigateDeniesSkillRun(t *testing.T) {
	s := &Server{}
	tool := &registeredTool{Name: "pptx", Kind: "skill", Key: "skill:pptx"}
	res := s.runSkillTool(toolRunContext{WorkspaceID: "w-none", SessionMode: sessionModeInvestigate}, tool, toolCallRequest{
		Name: "pptx", Args: map[string]any{"action": "run", "command": "scripts/a.py"},
	}, time.Now())
	if res.Status != "denied" || res.Permission != "session_mode" {
		t.Fatalf("expected session_mode deny, got %#v", res)
	}
}

func TestInvestigateAllowsDocxBuiltinRun(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	s := &Server{Store: store.New()}
	s.Store.EnsureDocxSkillReady()
	tool := &registeredTool{Name: "docx", Kind: "skill", Key: "skill:docx", Mode: toolModeExecute, Enabled: true}
	res := s.runSkillTool(toolRunContext{
		WorkspaceID: "w1", SessionMode: sessionModeInvestigate,
		Viewer: &auth.Identity{ID: "u1", Name: "测试"},
		UserMessage: "生成入职材料清单通知",
	}, tool, toolCallRequest{
		Name: "docx", Args: map[string]any{
			"action": "run", "title": "入职材料清单通知", "content": "一、材料清单\n1. 身份证",
		},
	}, time.Now())
	if res.Status != "success" {
		t.Fatalf("docx builtin should succeed in investigate, got %#v", res)
	}
	if !strings.Contains(res.Output, "/api/skill-artifacts/") {
		t.Fatalf("missing artifact link: %s", res.Output)
	}
}
