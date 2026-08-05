package server

import "testing"

func TestNormalizeSessionModeAndFilter(t *testing.T) {
	if normalizeSessionMode("exec") != sessionModeExecute {
		t.Fatalf("exec -> execute")
	}
	reg := []registeredTool{
		{Key: "builtin:knowledge.retrieve", Name: "knowledge.retrieve", Kind: "builtin", Mode: toolModeExecute, Enabled: true},
		{Key: "skill:docx", Name: "docx", Kind: "skill", Mode: toolModeApproval, Enabled: true, RequiresApproval: true},
	}
	out := filterRegistryBySessionMode(reg, sessionModeInvestigate)
	for _, t0 := range out {
		if t0.RequiresApproval && t0.Kind == "skill" {
			t.Fatalf("investigate should strip approval skills")
		}
	}
	out2 := filterRegistryBySessionMode(reg, sessionModeExecute)
	if len(out2) != 2 {
		t.Fatalf("execute keeps all, got %d", len(out2))
	}
}

func TestContentSafetyRedact(t *testing.T) {
	t.Setenv("DE_CONTENT_SAFETY", "redact")
	r := applyContentSafety("联系我 13800138000")
	if !r.Redacted || r.Blocked {
		t.Fatalf("expected redact: %+v", r)
	}
	if r.Text == "联系我 13800138000" {
		t.Fatalf("phone not redacted")
	}
}

func TestAssertSessionWritable(t *testing.T) {
	if err := assertSessionWritableLocked(map[string]any{"status": "closed"}); err == nil {
		t.Fatal("closed should forbid")
	}
	if err := assertSessionWritableLocked(map[string]any{"handoff": map[string]any{"active": true}}); err == nil {
		t.Fatal("handoff should forbid")
	}
}
