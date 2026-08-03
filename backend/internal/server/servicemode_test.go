package server

import "testing"

func TestServiceModeOwnsPath(t *testing.T) {
	cases := []struct {
		mode ServiceMode
		path string
		want bool
	}{
		{ModeAll, "/api/skills", true},
		{ModeSys, "/api/workspaces", true},
		{ModeSys, "/api/audit-center", true},
		{ModeSys, "/api/zero-trust/evaluate", true},
		{ModeSys, "/api/home/kpis", true},
		{ModeSys, "/api/skills", false},
		{ModeCollab, "/api/tasks", true},
		{ModeCollab, "/api/copilot/conversations", true},
		{ModeCollab, "/api/digital-employees", true},
		{ModeCollab, "/api/models/providers", false},
		{ModeCap, "/api/model-providers", true},
		{ModeCap, "/api/knowledge/packages", true},
		{ModeCap, "/api/memory/records", true},
		{ModeCap, "/api/skills/catalog", true},
		{ModeCap, "/api/channel-control/health", true},
		{ModeCap, "/api/workspaces", false},
		{ModeWorkflow, "/api/workflows", true},
		{ModeWorkflow, "/api/workflow-runs", true},
		{ModeWorkflow, "/api/tasks", false},
		{ModeSys, "/healthz", true},
		{ModeCap, "/healthz", true},
	}
	for _, tc := range cases {
		if got := tc.mode.OwnsPath(tc.path); got != tc.want {
			t.Errorf("%s.OwnsPath(%q)=%v want %v", tc.mode, tc.path, got, tc.want)
		}
	}
}

func TestParseServiceMode(t *testing.T) {
	if ParseServiceMode("de-sys") != ModeSys {
		t.Fatal("de-sys")
	}
	if ParseServiceMode("") != ModeAll {
		t.Fatal("empty")
	}
}
