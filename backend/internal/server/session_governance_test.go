package server

import (
	"errors"
	"testing"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

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

func TestApplySessionGovernanceRunMode(t *testing.T) {
	sess := map[string]any{"sessionMode": sessionModeInvestigate}
	applySessionGovernancePatch(sess, map[string]any{
		"runMode":          "agent",
		"reasoningEffort":  "deep",
		"sessionMode":      sessionModeExecute,
	}, nil, nowRFC3339())
	if str(sess["runMode"]) != "agent" {
		t.Fatalf("runMode=%v", sess["runMode"])
	}
	if str(sess["reasoningEffort"]) != "deep" {
		t.Fatalf("reasoningEffort=%v", sess["reasoningEffort"])
	}
	if str(sess["sessionMode"]) != sessionModeExecute {
		t.Fatalf("sessionMode=%v", sess["sessionMode"])
	}
	applySessionGovernancePatch(sess, map[string]any{"runMode": "nope", "reasoningEffort": "max"}, nil, nowRFC3339())
	if str(sess["runMode"]) != "agent" || str(sess["reasoningEffort"]) != "deep" {
		t.Fatalf("invalid values must be ignored")
	}
}

func TestReasoningEffortGuidance(t *testing.T) {
	if reasoningEffortGuidance("off") == "" {
		t.Fatal("off should inject guidance")
	}
	if reasoningEffortGuidance("deep") == "" {
		t.Fatal("deep should inject guidance")
	}
	if reasoningEffortGuidance("standard") != "" {
		t.Fatal("standard keeps default prompt")
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
	err := assertSessionWritableLocked(map[string]any{"status": "closed"})
	if err == nil {
		t.Fatal("closed should forbid")
	}
	var closed *apperr.AppError
	if !errors.As(err, &closed) || closed.Code != apperr.SessionClosed {
		t.Fatalf("want E_SESSION_CLOSED, got %v", err)
	}
	err = assertSessionWritableLocked(map[string]any{"handoff": map[string]any{"active": true}})
	if err == nil {
		t.Fatal("handoff should forbid")
	}
	var handoff *apperr.AppError
	if !errors.As(err, &handoff) || handoff.Code != apperr.SessionHandoff {
		t.Fatalf("want E_SESSION_HANDOFF, got %v", err)
	}
}
