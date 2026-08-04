package modelprov

import "testing"

func TestBuildLocalChatReplyCapabilities(t *testing.T) {
	system := `你是「听风」。
岗位：人事专员 · 人事部
职责说明：负责入职办理与人事政策解答。
职责边界：入职办理、假期政策解答、招聘进度简报
禁止行为：擅自改编制、泄露薪酬明细
可用工具：hr-policy、onboarding、recruit
已检索已发布知识（仅供参考）：
- 年假制度：满一年享5天
`
	out := BuildLocalChatReply(system, "你都可以做什么？")
	if !containsAll(out, "听风", "入职办理", "假期政策") {
		t.Fatalf("capabilities reply weak: %s", out)
	}
	if containsAll(out, "模型中心完成供应商配置") {
		t.Fatalf("should not nudge provider config: %s", out)
	}
}

func TestBuildLocalChatReplyLeave(t *testing.T) {
	system := "你是「听风」。\n岗位：人事专员 · 人事部\n职责边界：假期政策解答"
	out := BuildLocalChatReply(system, "年假怎么算？")
	if !containsAll(out, "年假", "请假") {
		t.Fatalf("leave reply weak: %s", out)
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !containsAny(s, p) {
			return false
		}
	}
	return true
}
