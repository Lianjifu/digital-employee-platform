package store

import "testing"

func TestEnsureEmployeesReplyModeDefaults(t *testing.T) {
	s := New()
	s.EnsureEmployeesReplyModeDefaults()
	for _, emp := range s.Employees {
		rt, _ := emp["runtime"].(map[string]any)
		if str(rt["replyMode"]) != DefaultEmployeeReplyMode {
			t.Fatalf("employee %s replyMode=%v want %s", emp["id"], rt["replyMode"], DefaultEmployeeReplyMode)
		}
		if str(rt["segmentPolicy"]) != DefaultEmployeeSegmentPolicy {
			t.Fatalf("employee %s segmentPolicy=%v want %s", emp["id"], rt["segmentPolicy"], DefaultEmployeeSegmentPolicy)
		}
	}
}

func TestApplyDefaultReplyModeRuntimePreservesExplicit(t *testing.T) {
	emp := map[string]any{"runtime": map[string]any{"replyMode": "single"}}
	ApplyDefaultReplyModeRuntime(emp)
	rt, _ := emp["runtime"].(map[string]any)
	if str(rt["replyMode"]) != "single" {
		t.Fatalf("explicit single preserved, got %v", rt["replyMode"])
	}
}
