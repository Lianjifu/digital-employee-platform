package store

import "strings"

var generalPackSkillNames = []string{
	"weather", "summarize", "github", "docx", "pdf", "pptx",
	"frontend-design", "web-design-guidelines", "diagram-maker", "gog",
}

// All PilotDeck-aligned tools for de-general (P0–P3).
var generalPackPlatformTools = []string{
	"knowledge.retrieve", "memory.recall", "skill.read", "time.now",
	"todo_write", "ask_user_question", "structured_output",
	"enter_plan_mode", "exit_plan_mode",
}

var generalPackRuntimeTools = []string{
	"read_file", "glob", "grep", "bash", "write_file", "edit_file",
	"web_search", "web_fetch", "execute_code", "edit_notebook", "send_attachment",
	"agent", "task_create", "task_list", "task_output", "task_wait", "task_stop",
	"list_mcp_resources", "read_mcp_resource",
}

func (s *Store) EnsureGeneralEmployee() {
	s.Lock()
	defer s.Unlock()
	s.EnsureGeneralEmployeeLocked(nil)
}

func (s *Store) EnsureGeneralEmployeeLocked(_ any) {
	generalTools := append(append([]string{}, generalPackPlatformTools...), generalPackRuntimeTools...)
	skillDisplay := append([]string{}, generalPackSkillNames...)

	found := false
	for _, emp := range s.Employees {
		if str(emp["id"]) == "de-general" {
			found = true
			applyGeneralEmployeeCaps(emp, skillDisplay, generalTools)
			break
		}
	}
	if !found {
		s.Employees = append(s.Employees, map[string]any{
			"id": "de-general", "workspaceId": "w1", "name": "通用助手", "role": "通用", "department": "平台",
			"description": "默认通用岗位包助手", "owner": "平台管理员", "ownerId": "u1",
			"escalationOwner": "平台管理员", "serviceObject": "全员",
			"version": "2.0.0", "environment": "production", "lifecycle": "active", "risk": "low",
			"responsibilities": []string{"日常问答", "文档生成", "信息检索", "协作扩展"},
			"prohibitedActions": []string{"未经审批的生产变更"},
			"capabilities": map[string]any{
				"model": "gpt-4o", "knowledge": []string{"运维知识库"},
				"skills": skillDisplay, "tools": generalTools,
				"workflows": []string{}, "channels": []string{"Web"},
			},
			"memoryPolicy": map[string]any{"shortTermHours": 24, "workingDays": 7, "longTermCadence": "daily", "knowledgePromotion": "approval_required"},
			"runtime":      map[string]any{"calls24h": 0, "successRate": 1, "p95Ms": 0, "costToday": 0, "handoffs24h": 0, "anomalies": 0},
			"evaluation":   map[string]any{"status": "passed", "score": 90.0, "lastRunAt": "2026-07-21T00:00:00Z"},
			"release":      map[string]any{"status": "released", "releasedAt": "2026-07-21T00:00:00Z", "requestedBy": "平台管理员", "requestedById": "u1", "approver": "平台管理员", "approverId": "u1"},
			"updatedAt":    "2026-07-21T00:00:00Z",
		})
		applyGeneralEmployeeCaps(s.Employees[len(s.Employees)-1], skillDisplay, generalTools)
	}
}

func applyGeneralEmployeeCaps(emp map[string]any, skills, tools []string) {
	caps, _ := emp["capabilities"].(map[string]any)
	if caps == nil {
		caps = map[string]any{}
		emp["capabilities"] = caps
	}
	caps["skills"] = append([]string{}, skills...)
	caps["tools"] = append([]string{}, tools...)

	bp, _ := emp["boundaryPolicy"].(map[string]any)
	if bp == nil {
		bp = map[string]any{}
		emp["boundaryPolicy"] = bp
	}
	modes := anyMapSlice(bp["capabilityModes"])
	setMode := func(kind, name, mode string) {
		for _, m := range modes {
			if str(m["capabilityType"]) == kind && strings.EqualFold(str(m["capabilityName"]), name) {
				m["mode"] = mode
				bp["capabilityModes"] = modes
				return
			}
		}
		modes = append(modes, map[string]any{
			"capabilityType": kind, "capabilityName": name, "mode": mode,
		})
		bp["capabilityModes"] = modes
	}
	for _, sk := range []string{"docx", "pptx"} {
		setMode("skill", sk, "approval_required")
	}
	for _, t := range []string{"bash", "write_file", "edit_file", "execute_code", "edit_notebook", "agent", "task_stop"} {
		setMode("tool", t, "approval_required")
	}
	for _, pt := range generalPackPlatformTools {
		setMode("tool", pt, "execute")
	}
	for _, rt := range []string{"read_file", "glob", "grep", "web_search", "web_fetch", "task_create", "task_list", "task_output", "task_wait", "list_mcp_resources", "read_mcp_resource", "send_attachment"} {
		setMode("tool", rt, "execute")
	}
}
