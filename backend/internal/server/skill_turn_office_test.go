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
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/a.md --out .copilot-ws/b.pptx", "")
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
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/missing.md --out .copilot-ws/out.pptx", "")
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
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/ok.md --out .copilot-ws/out.pptx", "")
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
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/thin.md --out .copilot-ws/out.pptx", "")
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

// TestOfficeSkillRunPreflightRejectsPlaceholders guards the "fill-in-the-blanks outline"
// regression — a long outline stuffed with _____ / [待填] must fail preflight instead of
// producing a useless fill-in-form PPT.
func TestOfficeSkillRunPreflightRejectsPlaceholders(t *testing.T) {
	dir := t.TempDir()
	outline := filepath.Join(dir, ".copilot-ws", "ph.md")
	if err := os.MkdirAll(filepath.Dir(outline), 0o755); err != nil {
		t.Fatal(err)
	}
	// The exact shape from the user-reported failure: many sections, all fill-in placeholders.
	body := strings.Join([]string{
		"# 季度汇报",
		"",
		"## 一、季度目标",
		"- 核心目标：____",
		"- 指标1：____",
		"- 指标2：____",
		"- 责任人：____",
		"- 完成情况：____",
		"- 后续动作：____",
		"",
		"## 二、项目进展",
		"- 项目A：____",
		"- 项目B：____",
		"- 项目C：____",
		"- 项目D：____",
		"- 项目E：____",
		"",
		"## 三、风险与计划",
		"- 风险1：____",
		"- 风险2：____",
		"- 下季度计划：____",
		"- 资源需求：____",
		"- 协同诉求：____",
		"",
	}, "\n")
	if err := os.WriteFile(outline, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/ph.md --out .copilot-ws/out.pptx", "")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected placeholder rejection, ok=%v pf=%+v", ok, pf)
	}
	if !strings.Contains(pf.Error, "占位符") && !strings.Contains(pf.Output, "占位符") {
		t.Fatalf("expected 占位符 message, got err=%q out=%q", pf.Error, pf.Output)
	}
}

// TestOfficeSkillRunPreflightRejectsGenericTemplate guards the "long outline but no
// actual topic markers" regression — sections exist and chars are enough, but the body
// says nothing about the user's actual topic. Keyword floor must refuse.
func TestOfficeSkillRunPreflightRejectsGenericTemplate(t *testing.T) {
	dir := t.TempDir()
	outline := filepath.Join(dir, ".copilot-ws", "generic.md")
	if err := os.MkdirAll(filepath.Dir(outline), 0o755); err != nil {
		t.Fatal(err)
	}
	// Multi-section, ≥200 chars, no fill-in tokens — but completely generic filler text.
	body := strings.Join([]string{
		"# 通用材料",
		"",
		"## 一、开篇引言",
		"本节以背景介绍为主，辅以概要陈述，并在段落中适当延展，确保整体覆盖典型读者所关心的面。",
		"",
		"## 二、核心叙事",
		"围绕主题逐层展开，论述三个分论点，承接上一节的过渡，并在段落结尾处给出小结。",
		"",
		"## 三、场景刻画",
		"对若干典型场景进行还原，给出具体可见的细节，并在每段后增加总结句，便于把握重点。",
		"",
		"## 四、后续落点",
		"收束全文，提示下一阶段值得关注的内容，呼应开篇所述，并提示读者留意正文之外的边界。",
		"",
	}, "\n")
	if err := os.WriteFile(outline, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "docx", "packagePath": dir,
	}, "bash scripts/docx.sh create --spec .copilot-ws/generic.md --out .copilot-ws/out.docx", "")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected keyword-floor rejection, ok=%v pf=%+v", ok, pf)
	}
	if !strings.Contains(pf.Error, "关键词") && !strings.Contains(pf.Output, "关键词") {
		t.Fatalf("expected 关键词 message, got err=%q out=%q", pf.Error, pf.Output)
	}
}

// TestClarifyingQuestionsForSkill guards P3 — when preflight rejects a generic outline,
// the error must surface skill-specific questions the agent can ask the user. Without
// this, the agent loops with another generic template instead of gathering facts.
func TestClarifyingQuestionsForSkill(t *testing.T) {
	for _, name := range []string{"pptx", "docx", "xlsx"} {
		qs := clarifyingQuestionsForSkill(name)
		if len(qs) < 2 {
			t.Errorf("%s: expected ≥2 clarifying questions, got %v", name, qs)
		}
	}
	if qs := clarifyingQuestionsForSkill("unknown-skill"); qs != nil {
		t.Errorf("unknown skill should return nil, got %v", qs)
	}
}

// TestOfficeSkillRunPreflightSurfaceClarifyingQuestions ensures the question list
// actually flows into the rejection message when keyword floor fails.
func TestOfficeSkillRunPreflightSurfaceClarifyingQuestions(t *testing.T) {
	dir := t.TempDir()
	outline := filepath.Join(dir, ".copilot-ws", "qa.md")
	if err := os.MkdirAll(filepath.Dir(outline), 0o755); err != nil {
		t.Fatal(err)
	}
	// Long, multi-section, no placeholders, but no docx floor keyword → reject + surface questions.
	body := strings.Join([]string{
		"# 材料",
		"",
		"## 一、开篇引言",
		"本节以背景介绍为主，辅以概要陈述，并在段落中适当延展，确保整体覆盖典型读者所关心的面。",
		"",
		"## 二、核心叙事",
		"围绕主题逐层展开，论述三个分论点，承接上一节的过渡，并在段落结尾处给出小结。",
		"",
		"## 三、场景刻画",
		"对若干典型场景进行还原，给出具体可见的细节，并在每段后增加总结句，便于把握重点。",
		"",
		"## 四、后续落点",
		"收束全文，提示下一阶段值得关注的内容，呼应开篇所述，并提示读者留意正文之外的边界。",
		"",
	}, "\n")
	if err := os.WriteFile(outline, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "docx", "packagePath": dir,
	}, "bash scripts/docx.sh create --spec .copilot-ws/qa.md --out .copilot-ws/out.docx", "")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected fail, ok=%v pf=%+v", ok, pf)
	}
	if !strings.Contains(pf.Output, "向用户追问") {
		t.Fatalf("expected clarifying questions in output, got: %s", pf.Output)
	}
}

// TestOfficeSkillRunPreflightRescuesMissingDepWithUserIntent guards the latest
// audit regression: when bash fires before the LLM's own write_file step lands,
// preflight must auto-materialize the missing outline from user intent and let
// the run proceed. Without this rescue, the user sees "缺依赖文件" even when the
// agent clearly meant to write a real outline.
func TestOfficeSkillRunPreflightRescuesMissingDepWithUserIntent(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".copilot-ws"), 0o755); err != nil {
		t.Fatal(err)
	}
	// outline missing, but we provide a rich user intent → rescue should write it.
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/q3.md --out .copilot-ws/q3.pptx",
		"输出 Q3 研发季度汇报 PPT")
	if !ok {
		t.Fatalf("expected rescue to write outline and pass, got pf=%+v", pf)
	}
	// Verify the file was actually written.
	got, err := os.ReadFile(filepath.Join(dir, ".copilot-ws", "q3.md"))
	if err != nil {
		t.Fatalf("rescue did not write outline: %v", err)
	}
	if !strings.Contains(string(got), "#") {
		t.Fatalf("rescued outline looks empty: %s", got)
	}
}

// TestOfficeSkillRunPreflightStillRejectsWithoutUserIntent: rescue is opt-in via
// userMessage. With empty userMessage, the existing "缺依赖文件" failure path is
// preserved so callers without conversation context don't accidentally fabricate stubs.
func TestOfficeSkillRunPreflightStillRejectsWithoutUserIntent(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".copilot-ws"), 0o755); err != nil {
		t.Fatal(err)
	}
	pf, ok := officeSkillRunPreflight(map[string]any{
		"name": "pptx", "packagePath": dir,
	}, "bash scripts/pptx.sh node scripts/build_from_outline.mjs --outline-file .copilot-ws/missing.md --out .copilot-ws/out.pptx", "")
	if ok || pf.Status != "failed" {
		t.Fatalf("expected fail without user intent, ok=%v pf=%+v", ok, pf)
	}
	if !strings.Contains(pf.Output, "缺少依赖文件") {
		t.Fatalf("expected 缺少依赖文件 message, got: %s", pf.Output)
	}
}

// TestCountPlaceholderLines sanity-checks the regex coverage (_____ [待填] [TODO] {{x}}).
func TestCountPlaceholderLines(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantPh  int
		wantTot int
	}{
		{"none", "一、概述\n\n- 要点一\n- 要点二", 0, 3},
		{"underscores", "## 季度目标\n- 目标：____\n- 责任人：________\n## 风险\n- 风险A：____", 3, 5},
		{"mixed tokens", "## 待办\n- [待填]\n- [TODO] 跟进\n## 数据\n- 字段：{{name}}\n- 备注：空", 3, 6},
		{"blank lines ignored", "## A\n\n- item\n\n## B", 0, 3},
	}
	for _, tc := range cases {
		ph, tot := countPlaceholderLines(tc.body)
		if ph != tc.wantPh || tot != tc.wantTot {
			t.Errorf("%s: want ph=%d tot=%d, got ph=%d tot=%d", tc.name, tc.wantPh, tc.wantTot, ph, tot)
		}
	}
}
