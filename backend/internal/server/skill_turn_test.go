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

func TestShouldAutoRunAfterSkillWrite(t *testing.T) {
	ok := toolExecResult{Status: "success", Output: "【skill.write】已写入 .copilot-ws/gen.mjs\n下一步可用 action=run command=.copilot-ws/gen.mjs"}
	if !shouldAutoRunAfterSkillWrite(ok, ".copilot-ws/gen.mjs") {
		t.Fatal("expected auto run for .copilot-ws mjs")
	}
	if shouldAutoRunAfterSkillWrite(toolExecResult{Status: "failed"}, ".copilot-ws/gen.mjs") {
		t.Fatal("failed write should not auto run")
	}
	if shouldAutoRunAfterSkillWrite(ok, "README.md") {
		t.Fatal("non-script should not auto run")
	}
}

func TestBuildAutoRunToolCallAfterWrite(t *testing.T) {
	reg := []registeredTool{
		{Name: "pptx", Kind: "skill", Key: "skill:pptx", Enabled: true},
		{Name: "write_file", Kind: "runtime", Enabled: true},
	}
	writeTool := &registeredTool{Name: "write_file", Kind: "runtime"}
	call := buildAutoRunToolCallAfterWrite(reg, writeTool, toolCallRequest{Name: "write_file"}, ".copilot-ws/gen_ppt.mjs")
	if call.Name != "pptx" {
		t.Fatalf("want pptx skill run, got %q", call.Name)
	}
	if str(call.Args["command"]) != ".copilot-ws/gen_ppt.mjs" {
		t.Fatalf("command=%v", call.Args["command"])
	}
	skillTool := &registeredTool{Name: "pptx", Kind: "skill"}
	call2 := buildAutoRunToolCallAfterWrite(reg, skillTool, toolCallRequest{Name: "pptx"}, ".copilot-ws/a.js")
	if call2.Name != "pptx" || str(call2.Args["action"]) != skillActionRun {
		t.Fatalf("skill write auto run=%v", call2)
	}
}

func TestIsSkillWorkspaceWriteCall(t *testing.T) {
	if !isSkillWorkspaceWriteCall(toolCallRequest{
		Name: "write_file",
		Args: map[string]any{"path": ".copilot-ws/gen.mjs", "content": "x"},
	}, &registeredTool{Name: "write_file", Kind: "runtime"}) {
		t.Fatal("write_file to copilot-ws should qualify")
	}
	if isSkillWorkspaceWriteCall(toolCallRequest{
		Name: "write_file",
		Args: map[string]any{"path": "SKILL.md", "content": "x"},
	}, &registeredTool{Name: "write_file", Kind: "runtime"}) {
		t.Fatal("write outside copilot-ws should not auto run")
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

func TestResetFailedRunStepsForContinue(t *testing.T) {
	runCmd := `bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/q.md --out .copilot-ws/q.pptx`
	plan := map[string]any{
		"steps": []map[string]any{
			{"id": "write", "action": skillActionWrite, "status": "success"},
			{"id": "run", "action": skillActionRun, "status": "failed", "args": map[string]any{"action": skillActionRun, "command": runCmd}},
		},
	}
	if nextPendingSkillTurnStep(plan) != nil {
		t.Fatal("failed run should not be pending before reset")
	}
	resetFailedRunStepsForContinue(plan)
	next := nextPendingSkillTurnStep(plan)
	if next == nil || str(next["action"]) != skillActionRun {
		t.Fatalf("expected run pending after reset, got %v", next)
	}
	if skillTurnRunCommand(plan) != runCmd {
		t.Fatalf("run command=%q", skillTurnRunCommand(plan))
	}
}

func TestPreferredNextRunCommandSkipsOutlineFile(t *testing.T) {
	runCmd := `bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/q.md --out .copilot-ws/q.pptx`
	plan := map[string]any{
		"steps": []map[string]any{
			{"id": "write", "action": skillActionWrite, "status": "success"},
			{"id": "run", "action": skillActionRun, "status": "failed", "args": map[string]any{"action": skillActionRun, "command": runCmd}},
		},
	}
	out := "【skill.write】已写入 .copilot-ws/q.md（12 bytes）\n下一步可用 action=run command=.copilot-ws/q.md"
	cmd := preferredNextRunCommand(plan, map[string]any{}, out)
	if cmd != runCmd {
		t.Fatalf("want run script, got %q", cmd)
	}
}

// TestBuildSkillTurnPlanRunRewritesScriptForTool verifies the LLM-emitted hardcoded
// `scripts/pptx.sh` is rewritten to `scripts/<toolName>.sh` so a docx Skill Turn
// dispatches into the docx package, not the pptx one (screenshot 2 of the audit).
func TestBuildSkillTurnPlanRunRewritesScriptForTool(t *testing.T) {
	tool := &registeredTool{Name: "docx", Kind: "skill", Key: "skill:docx"}
	cmd := `bash scripts/pptx.sh node scripts/build_from_outline.mjs --spec .copilot-ws/out.md --out .copilot-ws/out.docx`
	plan := buildSkillTurnPlan(tool, toolCallRequest{Name: "docx", Args: map[string]any{"action": "run", "command": cmd}})
	if plan == nil {
		t.Fatal("expected plan")
	}
	runCmd := skillTurnRunCommand(plan)
	if !strings.Contains(runCmd, "scripts/docx.sh") {
		t.Fatalf("script name not rewritten for docx tool: %q", runCmd)
	}
	if strings.Contains(runCmd, "scripts/pptx.sh") {
		t.Fatalf("pptx script leaked into docx plan: %q", runCmd)
	}
}

// TestNextPendingSkillTurnStepRespectsDeps verifies a run step that declares
// `deps: [write-...]` is skipped until the write step lands in success state.
// This guards the screenshot-1 regression where bash failed because it raced
// the write step.
func TestNextPendingSkillTurnStepRespectsDeps(t *testing.T) {
	plan := map[string]any{
		"steps": []map[string]any{
			{"id": "write-.copilot-ws-q.md", "action": skillActionWrite, "status": "pending"},
			{
				"id":     "run",
				"action": skillActionRun,
				"status": "pending",
				"deps":   []string{"write-.copilot-ws-q.md"},
				"args":   map[string]any{"action": skillActionRun, "command": "bash scripts/x.sh --outline-file .copilot-ws/q.md"},
			},
		},
	}
	// Both pending → write must come first because run's dep isn't satisfied yet.
	got := nextPendingSkillTurnStep(plan)
	if got == nil || coalesce(str(got["id"]), str(got["action"])) != "write-.copilot-ws-q.md" {
		t.Fatalf("expected write step first, got %+v", got)
	}
	// Mark write success → nextPending should now pick the run.
	for i, st := range skillTurnSteps(plan) {
		if coalesce(str(st["id"]), str(st["action"])) == "write-.copilot-ws-q.md" {
			plan["steps"].([]map[string]any)[i]["status"] = "success"
		}
	}
	got = nextPendingSkillTurnStep(plan)
	if got == nil || coalesce(str(got["id"]), str(got["action"])) != "run" {
		t.Fatalf("expected run step after write success, got %+v", got)
	}
}

// TestCanRetryRunAfterDeps verifies the retry gate: a failed run step that
// hit preflight "缺依赖文件" can be retried once its write dep succeeds, but
// other failure modes (policy/auth/timeout) stay blocked.
func TestCanRetryRunAfterDeps(t *testing.T) {
	plan := map[string]any{
		"steps": []map[string]any{
			{"id": "write-.copilot-ws-q.md", "action": skillActionWrite, "status": "success"},
			{
				"id":     "run",
				"action": skillActionRun,
				"status": "failed",
				"deps":   []string{"write-.copilot-ws-q.md"},
				"output": "缺少依赖文件 .copilot-ws/q.md（须先 action=write 写入或等待 Skill Turn write 步骤完成）",
			},
		},
	}
	res := toolExecResult{Status: "failed", Output: "缺少依赖文件 .copilot-ws/q.md（须先 action=write 写入或等待 Skill Turn write 步骤完成）"}
	if !canRetryRunAfterDeps(plan, "run", res) {
		t.Fatal("expected retry to be permitted for missing-deps failure after write success")
	}
	// Same failure but write dep still pending → no retry.
	plan["steps"].([]map[string]any)[0]["status"] = "pending"
	if canRetryRunAfterDeps(plan, "run", res) {
		t.Fatal("retry should be blocked when dep hasn't landed")
	}
	// Different failure (auth denial) → no retry even with success dep.
	plan["steps"].([]map[string]any)[0]["status"] = "success"
	denied := toolExecResult{Status: "denied", Permission: "policy", Output: "策略拦截：拒绝执行"}
	if canRetryRunAfterDeps(plan, "run", denied) {
		t.Fatal("retry should be blocked for non-deps failure")
	}
}
