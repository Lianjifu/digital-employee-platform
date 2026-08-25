package server

import (
	"strings"
	"testing"
)

func TestUserFacingExecuteSummary(t *testing.T) {
	raw := "—— 步骤 写入技能工作区脚本 ——\nwrite ok\n—— 步骤 执行脚本生成产物 ——\nsandbox=x\n已生成 Word 文档「招聘岗位模板」"
	got := userFacingExecuteSummary(raw)
	if !strings.Contains(got, "招聘岗位模板") {
		t.Fatalf("got %q", got)
	}
	if strings.Contains(got, "sandbox") {
		t.Fatalf("should not leak technical output: %q", got)
	}
}

func TestAppendAuthorizedExecuteResultNextRun(t *testing.T) {
	got := appendAuthorizedExecuteResult("base", "—— 步骤 写入 ——\n已生成 Word 文档「测试」", "scripts/gen.py")
	if !strings.Contains(got, "测试") {
		t.Fatalf("unexpected: %q", got)
	}
	if strings.Contains(got, "—— 步骤") {
		t.Fatalf("should summarize steps: %q", got)
	}
	if !strings.Contains(got, "待续跑") {
		t.Fatalf("missing next run hint: %q", got)
	}
}

func TestAppendAuthorizedExecuteResultDedupes(t *testing.T) {
	base := "等待审核"
	out := "—— 步骤 执行 ——\n已生成 Word 文档「模板」"
	first := appendAuthorizedExecuteResult(base, out, "")
	if !strings.Contains(first, "模板") {
		t.Fatalf("unexpected first append: %q", first)
	}
	second := appendAuthorizedExecuteResult(first, "duplicate", "")
	if second != first {
		t.Fatalf("expected dedupe, got %q", second)
	}
}

func TestLastUserMessageLocked(t *testing.T) {
	msgs := []map[string]any{
		{"role": "user", "content": "first"},
		{"role": "assistant", "content": "reply"},
		{"role": "user", "content": "请生成招聘岗位模板 Word"},
	}
	if got := lastUserMessageLocked(msgs); got != "请生成招聘岗位模板 Word" {
		t.Fatalf("got %q", got)
	}
}
