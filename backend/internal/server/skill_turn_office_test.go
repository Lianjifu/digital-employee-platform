package server

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCopilotWSDepsFromCommand(t *testing.T) {
	cmd := `bash scripts/pptx.sh node scripts/build_from_outline.mjs --title "团队" --outline-file .copilot-ws/team_outline.md --out .copilot-ws/out.pptx`
	deps := copilotWSDepsFromCommand(cmd)
	if len(deps) != 1 || deps[0] != ".copilot-ws/team_outline.md" {
		t.Fatalf("expected outline dep only, got %v", deps)
	}
}

func TestBuildSkillTurnPlanRunInjectsWrite(t *testing.T) {
	tool := &registeredTool{Name: "pptx", Kind: "skill", Key: "skill:pptx"}
	cmd := `bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/q.md --out .copilot-ws/q.pptx`
	plan := buildSkillTurnPlan(tool, toolCallRequest{
		Name: "pptx",
		Args: map[string]any{
			"action":  "run",
			"command": cmd,
			"outline": "# Q1 评估\n\n- 目标\n",
		},
	})
	if plan == nil {
		t.Fatal("expected plan")
	}
	steps := skillTurnSteps(plan)
	if len(steps) != 2 {
		t.Fatalf("want write+run, got %d steps: %v", len(steps), steps)
	}
	if str(steps[0]["action"]) != skillActionWrite {
		t.Fatalf("step0=%v", steps[0])
	}
	wa, _ := steps[0]["args"].(map[string]any)
	if str(wa["path"]) != ".copilot-ws/q.md" && skillWritePathFromArgs(wa) != ".copilot-ws/q.md" {
		t.Fatalf("write path=%v", wa["path"])
	}
	if !strings.Contains(str(wa["content"]), "Q1") {
		t.Fatalf("content=%v", wa["content"])
	}
}

func TestOfficeSkillRunPreflightMissingPackage(t *testing.T) {
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": "",
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/a.md --out .copilot-ws/b.pptx")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected package missing fail, ok=%v pf=%+v", ok, pf)
	}
}

func TestOfficeSkillRunPreflightMissingDep(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "scripts"), 0o755); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/missing.md --out .copilot-ws/out.pptx")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected dep missing fail, ok=%v pf=%+v", ok, pf)
	}
}

func TestOfficeSkillRunPreflightPass(t *testing.T) {
	dir := t.TempDir()
	outline := filepath.Join(dir, ".copilot-ws", "ok.md")
	if err := os.MkdirAll(filepath.Dir(outline), 0o755); err != nil {
		t.Fatal(err)
	}
	// New preflight enforces content quality (≥3 sections, ≥200 chars). Use a real outline.
	body := "# 季度汇报\n\n## 一、概述\n- 背景说明：本季度业务重点与目标，覆盖研发交付、质量稳定、客户响应三条主线，并复盘关键里程碑达成情况及差距。\n\n## 二、核心内容\n- 要点一：研发交付节奏与版本发布，整体按计划推进。\n- 要点二：质量与稳定性指标，缺陷密度持续下降。\n- 要点三：客户响应与反馈处理，平均响应时长压缩。\n\n## 三、总结与下一步\n- 结论：关键能力已基本建立，下季度继续深化跨部门协同。\n- 行动项：按责任人落实与跟踪，定期复盘进度。\n"
	if err := os.WriteFile(outline, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/ok.md --out .copilot-ws/out.pptx")
	if !ok || pf.Status != "" {
		t.Fatalf("expected pass, ok=%v pf=%+v", ok, pf)
	}
}

// TestOfficeSkillRunPreflightRejectsThin guards against the previous 1-page stub regression:
// when a write step leaves the outline empty or trivially short, preflight must refuse
// rather than letting a placeholder drive generation.
func TestOfficeSkillRunPreflightRejectsThin(t *testing.T) {
	dir := t.TempDir()
	outline := filepath.Join(dir, ".copilot-ws", "thin.md")
	if err := os.MkdirAll(filepath.Dir(outline), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outline, []byte("# ok"), 0o644); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/thin.md --out .copilot-ws/out.pptx")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected fail on thin content, ok=%v pf=%+v", ok, pf)
	}
}

// TestInferOfficeOutlinePptx verifies the no-args branch produces a real multi-section outline
// from user intent (replacing the 3-bullet placeholder).
func TestInferOfficeOutlinePptx(t *testing.T) {
	out := inferOfficeOutline(&registeredTool{Name: "pptx", Kind: "skill"}, "输出 Q3 研发季度汇报模版 PPT")
	if !strings.Contains(out, "## ") {
		t.Fatalf("expected multiple sections, got: %s", out)
	}
	if !strings.Contains(out, "# ") {
		t.Fatalf("expected H1 title, got: %s", out)
	}
}
