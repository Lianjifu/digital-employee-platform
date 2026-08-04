package server

import (
	"strings"
	"testing"

	"github.com/digital-employee-platform/backend/internal/store"
)

func TestClassifyCopilotMode_MultiAgentAndLevels(t *testing.T) {
	cases := []struct {
		msg, hint string
		wantMode  string
		wantLevel string
	}{
		{"你好", "", modeDirect, "P3"},
		{"年假怎么请", "", modeReact, "P1"},
		{"请给出入职材料清单并分步办理", "", modePlanExec, "P0"},
		{"请运维和人事一起看下故障与入职衔接", "", modeMultiAgent, "P0"},
		{"跨部门会商发布与合规", "", modeMultiAgent, "P0"},
		{"x", "multi_agent", modeMultiAgent, "P0"},
		{"x", "direct", modeDirect, "P3"},
	}
	for _, tc := range cases {
		got := classifyCopilotMode(tc.msg, tc.hint, "")
		if got.Mode != tc.wantMode || got.PolicyLevel != tc.wantLevel {
			t.Fatalf("msg=%q hint=%q => %#v want mode=%s level=%s", tc.msg, tc.hint, got, tc.wantMode, tc.wantLevel)
		}
	}
}

func TestResolveModelByPolicyLevel(t *testing.T) {
	st := store.New()
	s := New(st)
	// Explicit model wins
	mid, _, lv := s.resolveModelByPolicyLevel("w1", "mdl-gpt4", "P3")
	if mid != "mdl-gpt4" || lv != "" {
		t.Fatalf("explicit: %s %s", mid, lv)
	}
	// Demo alias falls through to published P3 policy
	mid, pid, used := s.resolveModelByPolicyLevel("w1", "sonnet-4", "P3")
	if mid != "mdl-mini" || used != "P3" || pid != "rp-p3" {
		t.Fatalf("demo alias resolve: mid=%s pid=%s used=%s", mid, pid, used)
	}
	mid, pid, used = s.resolveModelByPolicyLevel("w1", "", "P0")
	if mid != "mdl-gpt4" || used != "P0" || pid != "rp-p0" {
		t.Fatalf("P0 resolve: mid=%s pid=%s used=%s", mid, pid, used)
	}
}

func TestPickSpecialists(t *testing.T) {
	cands := []map[string]any{
		{"id": "de-sre", "name": "故障自愈助手", "role": "SRE", "department": "信息技术部", "responsibilities": []string{"故障响应"}},
		{"id": "de-hr", "name": "听风", "role": "人事专员", "department": "人事部", "responsibilities": []string{"入职办理"}},
		{"id": "de-qa", "name": "质检", "role": "QA", "department": "运营部"},
	}
	picks := pickSpecialists(cands, "请运维和人事一起看故障与入职", 3)
	if len(picks) < 2 {
		t.Fatalf("want >=2 specialists, got %#v", picks)
	}
	ids := map[string]bool{}
	for _, p := range picks {
		ids[p.ID] = true
	}
	if !ids["de-sre"] || !ids["de-hr"] {
		t.Fatalf("expected SRE+HR, got %#v", picks)
	}
	// SRE should rank above QA for this query
	if picks[0].ID != "de-sre" && picks[0].ID != "de-hr" {
		t.Fatalf("unexpected top %#v", picks[0])
	}
}

func TestLooksLikeMultiAgent(t *testing.T) {
	if !looksLikeMultiAgent("跨部门协作", strings.ToLower("跨部门协作")) {
		t.Fatal("expected multi")
	}
	if looksLikeMultiAgent("年假怎么请", strings.ToLower("年假怎么请")) {
		t.Fatal("single domain should not multi")
	}
}
