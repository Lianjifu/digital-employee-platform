package server

import (
	"strings"
	"testing"
)

func TestBuildSkillTurnPlanWriteThenRun(t *testing.T) {
	tool := &registeredTool{Name: "pptx", Kind: "skill", Key: "skill:pptx"}
	plan := buildSkillTurnPlan(tool, toolCallRequest{
		Name: "pptx",
		Args: map[string]any{
			"action":  "write",
			"path":    ".copilot-ws/gen_ppt.js",
			"content": "console.log(1)",
		},
	})
	if plan == nil {
		t.Fatal("expected plan")
	}
	if !strings.Contains(str(plan["summary"]), "写入") {
		t.Fatalf("summary=%v", plan["summary"])
	}
	steps := skillTurnSteps(plan)
	if len(steps) != 2 {
		t.Fatalf("want 2 steps, got %d", len(steps))
	}
	if str(steps[0]["action"]) != skillActionWrite {
		t.Fatalf("step0=%v", steps[0])
	}
	if str(steps[1]["action"]) != skillActionRun {
		t.Fatalf("step1=%v", steps[1])
	}
	runArgs, _ := steps[1]["args"].(map[string]any)
	if str(runArgs["command"]) != ".copilot-ws/gen_ppt.js" {
		t.Fatalf("run command=%v", runArgs["command"])
	}
}

func TestParseNextRunCommand(t *testing.T) {
	out := "【skill.write】已写入 .copilot-ws/gen_ppt.js\n下一步可用 action=run command=.copilot-ws/gen_ppt.js"
	cmd := parseNextRunCommand(out)
	if cmd != ".copilot-ws/gen_ppt.js" {
		t.Fatalf("got %q", cmd)
	}
}

func TestEnsureSkillTurnHasRunStep(t *testing.T) {
	plan := map[string]any{
		"summary": "写入技能工作区脚本",
		"steps": []map[string]any{
			{"id": "write", "action": skillActionWrite, "status": "success"},
		},
	}
	ensureSkillTurnHasRunStep(plan, ".copilot-ws/gen_ppt.js")
	if !skillTurnHasPending(plan) {
		t.Fatal("expected pending run")
	}
	step := nextPendingSkillTurnStep(plan)
	if str(step["action"]) != skillActionRun {
		t.Fatalf("pending=%v", step)
	}
}

func TestMarkAndAdvanceSkillTurn(t *testing.T) {
	tool := &registeredTool{Name: "pptx", Kind: "skill"}
	plan := buildSkillTurnPlan(tool, toolCallRequest{
		Name: "pptx",
		Args: map[string]any{"action": "write", "path": ".copilot-ws/a.js"},
	})
	markSkillTurnStep(plan, "write", "success", "ok")
	next := nextPendingSkillTurnStep(plan)
	if next == nil || str(next["action"]) != skillActionRun {
		t.Fatalf("expected run pending, got %v", next)
	}
	markSkillTurnStep(plan, "run", "success", "done")
	if skillTurnHasPending(plan) {
		t.Fatal("expected no pending")
	}
}
