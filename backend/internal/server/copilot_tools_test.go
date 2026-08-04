package server

import (
	"strings"
	"testing"
)

func TestBuildToolRegistry_DenyDisabledAndProhibited(t *testing.T) {
	emp := map[string]any{
		"capabilities": map[string]any{
			"tools":  []any{"CMDB", "kubectl"},
			"skills": []any{"docx"},
		},
		"boundaryPolicy": map[string]any{
			"capabilityModes": []any{
				map[string]any{"capabilityType": "tool", "capabilityName": "kubectl", "mode": "prohibited"},
				map[string]any{"capabilityType": "tool", "capabilityName": "CMDB", "mode": "execute"},
				map[string]any{"capabilityType": "skill", "capabilityName": "docx", "mode": "approval_required"},
			},
		},
	}
	reg := buildToolRegistry(emp, []string{"tool:cmdb", "skill:docx"})
	by := map[string]registeredTool{}
	for _, t0 := range reg {
		by[t0.Key] = t0
	}
	if _, ok := by["tool:kubectl"]; ok {
		t.Fatal("prohibited kubectl should not be registered")
	}
	if !by["tool:cmdb"].Enabled {
		t.Fatal("CMDB should be enabled")
	}
	if !by["skill:docx"].RequiresApproval {
		t.Fatal("docx should require approval")
	}
	if !by["skill:docx"].Enabled {
		t.Fatal("docx listed in enabledTools stays in registry as enabled; authorize must deny")
	}
	_, deny := authorizeToolCall(reg, toolCallRequest{Name: "docx", Args: map[string]any{}})
	if deny == nil || deny.Permission != "approval_required" {
		t.Fatalf("expected approval_required deny, got %#v", deny)
	}
	if !by["builtin:knowledge.retrieve"].Enabled {
		t.Fatal("builtin knowledge should stay enabled when only employee tools are selected")
	}
}

func TestAuthorizeToolCall_Disabled(t *testing.T) {
	reg := buildToolRegistry(nil, []string{"builtin:memory.recall"}) // explicitly select builtins only → knowledge off
	call := toolCallRequest{Name: "knowledge.retrieve", Args: map[string]any{"query": "x"}}
	_, deny := authorizeToolCall(reg, call)
	if deny == nil || deny.Status != "denied" {
		t.Fatalf("expected denied, got %#v", deny)
	}
	if deny.Permission != "disabled" {
		t.Fatalf("permission=%s", deny.Permission)
	}
}

func TestAuthorizeToolCall_Unregistered(t *testing.T) {
	reg := buildToolRegistry(nil, nil)
	_, deny := authorizeToolCall(reg, toolCallRequest{Name: "rm -rf", Args: nil})
	if deny == nil || deny.Permission != "deny" {
		t.Fatalf("%#v", deny)
	}
}

func TestParseToolCall(t *testing.T) {
	text := "先查一下\n<<<TOOL>>>\n{\"name\":\"knowledge.retrieve\",\"args\":{\"query\":\"入职\"}}\n<<<END>>>\n"
	call, ok := parseToolCall(text)
	if !ok {
		t.Fatal("parse failed")
	}
	if call.Name != "knowledge.retrieve" || str(call.Args["query"]) != "入职" {
		t.Fatalf("%#v", call)
	}
	if stripToolCallMarkers(text) == "" {
		// may still have 先查一下
	}
	cleaned := stripToolCallMarkers(text)
	if strings.Contains(cleaned, "<<<TOOL>>>") {
		t.Fatalf("strip failed: %q", cleaned)
	}
}

func TestToolRegistryPrompt_ListsEnabledOnly(t *testing.T) {
	reg := []registeredTool{
		{Key: "builtin:knowledge.retrieve", Name: "knowledge.retrieve", Kind: "builtin", Enabled: true, Description: "rag"},
		{Key: "tool:cmdb", Name: "CMDB", Kind: "tool", Enabled: false, Description: "off"},
	}
	p := toolRegistryPrompt(reg)
	if !strings.Contains(p, "knowledge.retrieve") {
		t.Fatal(p)
	}
	if strings.Contains(p, "CMDB") {
		t.Fatal("disabled tool should not appear in prompt", p)
	}
}
