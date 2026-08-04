package server

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/modelprov"
)

const multiAgentMaxSpecialists = 3

type specialistRef struct {
	ID         string
	Name       string
	Role       string
	Department string
	Score      int
	Task       string
}

func (s *Server) listActiveSpecialists(ws, excludeID string) []map[string]any {
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, e := range s.Store.Employees {
		if str(e["workspaceId"]) != ws {
			continue
		}
		id := str(e["id"])
		if id == "" || id == excludeID {
			continue
		}
		life := str(e["lifecycle"])
		if life != "active" && life != "published" {
			continue
		}
		cp := map[string]any{}
		for k, v := range e {
			cp[k] = v
		}
		out = append(out, cp)
	}
	return out
}

func scoreSpecialist(emp map[string]any, userMsg string) int {
	lower := strings.ToLower(userMsg)
	hay := strings.ToLower(strings.Join([]string{
		str(emp["name"]), str(emp["role"]), str(emp["department"]), str(emp["description"]),
		strings.Join(stringSlice(emp["responsibilities"]), " "),
	}, " "))
	score := 0
	hit := func(points int, roleNeedles []string, queryNeedles []string) {
		roleMatch := false
		for _, n := range roleNeedles {
			if strings.Contains(hay, strings.ToLower(n)) {
				roleMatch = true
				break
			}
		}
		if !roleMatch {
			return
		}
		for _, n := range queryNeedles {
			if strings.Contains(userMsg, n) || strings.Contains(lower, strings.ToLower(n)) {
				score += points
			}
		}
	}
	hit(4, []string{"sre", "运维", "信息", "故障", "值班"}, []string{"运维", "故障", "缓存", "发布", "kubectl", "CMDB", "SRE", "延迟", "扩容", "redis"})
	hit(4, []string{"人事", "hr", "招聘"}, []string{"人事", "入职", "年假", "招聘", "薪资", "HR"})
	hit(4, []string{"质检", "客服", "qa", "运营"}, []string{"质检", "客服", "对客", "投诉", "QA"})
	hit(4, []string{"财务", "报销"}, []string{"财务", "报销", "预算", "发票"})
	hit(4, []string{"法务", "合规", "审计"}, []string{"法务", "合规", "合同", "审计"})
	if score == 0 {
		score = 1
	}
	return score
}

func pickSpecialists(cands []map[string]any, userMsg string, max int) []specialistRef {
	type scored struct {
		emp   map[string]any
		score int
	}
	var list []scored
	for _, e := range cands {
		sc := scoreSpecialist(e, userMsg)
		if sc <= 0 {
			continue
		}
		list = append(list, scored{emp: e, score: sc})
	}
	// simple sort by score desc
	for i := 0; i < len(list); i++ {
		for j := i + 1; j < len(list); j++ {
			if list[j].score > list[i].score {
				list[i], list[j] = list[j], list[i]
			}
		}
	}
	if max <= 0 {
		max = multiAgentMaxSpecialists
	}
	if len(list) > max {
		list = list[:max]
	}
	out := make([]specialistRef, 0, len(list))
	for _, item := range list {
		e := item.emp
		task := fmt.Sprintf("请从「%s」岗位视角，针对用户问题给出简要专业意见（不超过 8 句）。", coalesce(str(e["role"]), str(e["name"])))
		out = append(out, specialistRef{
			ID: str(e["id"]), Name: str(e["name"]), Role: str(e["role"]),
			Department: str(e["department"]), Score: item.score, Task: task,
		})
	}
	return out
}

func specialistSystemPrompt(emp map[string]any) string {
	name := coalesce(str(emp["name"]), "数字员工")
	role := coalesce(str(emp["role"]), str(emp["title"]))
	dept := str(emp["department"])
	var b strings.Builder
	b.WriteString("你是协作子专家「")
	b.WriteString(name)
	b.WriteString("」。\n")
	if role != "" {
		b.WriteString("岗位：")
		b.WriteString(role)
		if dept != "" {
			b.WriteString(" · ")
			b.WriteString(dept)
		}
		b.WriteString("\n")
	}
	if desc := str(emp["description"]); desc != "" {
		b.WriteString("职责：")
		b.WriteString(desc)
		b.WriteString("\n")
	}
	if resp := stringSlice(emp["responsibilities"]); len(resp) > 0 {
		b.WriteString("职责边界：")
		b.WriteString(strings.Join(resp, "、"))
		b.WriteString("\n")
	}
	b.WriteString("只输出本岗位视角的简要意见，不要扮演其他岗位，不要输出 TOOL/PLAN 标记。")
	return b.String()
}

// runMultiAgentTurn: Supervisor selects specialists → isolated sub-calls → aggregate.
func (s *Server) runMultiAgentTurn(ctx context.Context, in reactTurnInput) reactTurnResult {
	reg := in.Registry
	supervisorID := in.DigitalEmployee
	cands := s.listActiveSpecialists(in.WorkspaceID, supervisorID)
	picks := pickSpecialists(cands, in.UserMessage, multiAgentMaxSpecialists)

	if len(picks) == 0 {
		in.Emit("agent", "multi", map[string]any{
			"status": "fallback", "reason": "no_active_specialists",
		})
		// Fall back to plan_exec when no peers available
		return s.runPlanExecuteTurn(ctx, in)
	}

	if !in.SkipRoute {
		in.Emit("route", "harness", map[string]any{
			"mode": modeMultiAgent, "reason": coalesce(in.RouteReason, "multi_agent"),
			"enabledTools": enabledToolKeys(reg), "modelId": in.ModelID,
			"specialists": len(picks),
		})
	}

	in.Emit("agent", "multi", map[string]any{
		"status": "supervising", "supervisorId": supervisorID,
		"specialists": specialistMaps(picks),
	})

	var toolCalls []map[string]any
	var opinions []string
	resolvedModel := in.ModelID
	var lastRT resolvedTurn

	// Optional shared retrieve for supervisor context
	runCtx := toolRunContext{
		Request: in.Request, WorkspaceID: in.WorkspaceID,
		DigitalEmployee: in.DigitalEmployee, ConversationID: in.ConversationID,
		CorrelationID: in.CorrelationID, UserMessage: in.UserMessage, Viewer: in.Viewer,
	}
	if in.Viewer != nil {
		runCtx.OwnerID = in.Viewer.ID
	}
	if t := registryLookup(reg, "knowledge.retrieve"); t != nil && t.Enabled {
		call := toolCallRequest{Name: "knowledge.retrieve", Args: map[string]any{"query": in.UserMessage}}
		res := s.runCopilotTool(runCtx, t, call)
		tcID := "tc_multi_kr"
		toolCalls = append(toolCalls, toolCallToPersist(tcID, call.Name, call.Args, res))
		in.Emit("tool", "multi", map[string]any{
			"name": call.Name, "status": res.Status, "id": tcID, "durationMs": res.DurationMs, "hits": res.Hits,
		})
		if res.Output != "" {
			opinions = append(opinions, "【共享知识检索】\n"+truncateRunes(res.Output, 800))
		}
	}

	empByID := map[string]map[string]any{}
	for _, e := range cands {
		empByID[str(e["id"])] = e
	}

	for i, sp := range picks {
		in.Emit("agent", "multi", map[string]any{
			"status": "delegating", "index": i + 1, "total": len(picks),
			"employeeId": sp.ID, "name": sp.Name, "role": sp.Role, "department": sp.Department,
			"task": sp.Task,
		})
		emp := empByID[sp.ID]
		sys := specialistSystemPrompt(emp)
		msgs := []modelprov.ChatMessage{
			{Role: "user", Content: "用户问题：\n" + in.UserMessage + "\n\n委派任务：\n" + sp.Task},
		}
		var buf strings.Builder
		text, rt, err := s.streamLLMForCopilot(ctx, in.Request, in.WorkspaceID, in.ModelID, msgs, sys, func(chunk, mid string) error {
			if mid != "" {
				resolvedModel = mid
			}
			buf.WriteString(chunk)
			return nil
		})
		status := "success"
		if err != nil && buf.Len() == 0 && text == "" {
			status = "failed"
			text = "子专家调用失败：" + err.Error()
		} else {
			if err == nil {
				lastRT = rt
				resolvedModel = coalesce(rt.ModelID, resolvedModel)
			}
			text = coalesce(text, buf.String())
		}
		text = stripToolCallMarkers(strings.TrimSpace(text))
		opinions = append(opinions, fmt.Sprintf("【%s · %s】\n%s", sp.Name, coalesce(sp.Role, sp.Department), truncateRunes(text, 1200)))
		toolCalls = append(toolCalls, map[string]any{
			"id": fmt.Sprintf("tc_agent_%s", sp.ID), "name": "agent.delegate",
			"args": map[string]any{"employeeId": sp.ID, "name": sp.Name, "role": sp.Role},
			"status": status, "result": truncateRunes(text, 400), "durationMs": 0,
		})
		in.Emit("agent", "multi", map[string]any{
			"status": "delegated", "employeeId": sp.ID, "name": sp.Name,
			"resultStatus": status, "preview": truncateRunes(text, 160),
		})
		time.Sleep(2 * time.Millisecond)
	}

	// Supervisor aggregate under primary employee persona
	in.Emit("stage", "aggregate", map[string]any{"status": "running", "mode": modeMultiAgent})
	aggSystem := strings.TrimSpace(in.System)
	if aggSystem != "" {
		aggSystem += "\n\n"
	}
	aggSystem += "你是主会话专家（Supervisor）。请综合各子专家意见，给出统一、可执行的中文答复；标明共识与分歧；不要输出 TOOL/PLAN 标记。"
	aggMsgs := append([]modelprov.ChatMessage{}, in.Messages...)
	aggMsgs = append(aggMsgs, modelprov.ChatMessage{
		Role: "user",
		Content: "用户请求：\n" + in.UserMessage + "\n\n子专家意见：\n" + strings.Join(opinions, "\n\n") + "\n\n请汇总最终答复。",
	})
	var aggBuf strings.Builder
	aggText, rt2, err2 := s.streamLLMForCopilot(ctx, in.Request, in.WorkspaceID, in.ModelID, aggMsgs, aggSystem, func(chunk, mid string) error {
		if mid != "" {
			resolvedModel = mid
		}
		aggBuf.WriteString(chunk)
		return nil
	})
	if err2 != nil && aggBuf.Len() == 0 && aggText == "" {
		return reactTurnResult{Err: err2, ToolCalls: toolCalls, Steps: len(picks), ModelID: resolvedModel, Mode: modeMultiAgent}
	}
	if err2 == nil {
		lastRT = rt2
		resolvedModel = coalesce(rt2.ModelID, resolvedModel)
	}
	finalText := stripToolCallMarkers(coalesce(aggText, aggBuf.String()))
	if finalText == "" {
		finalText = "已完成多专家会商，汇总如下：\n" + strings.Join(opinions, "\n\n")
	}
	in.Emit("stage", "aggregate", map[string]any{"status": "ok"})
	in.Emit("agent", "multi", map[string]any{"status": "completed", "specialists": len(picks)})

	if !in.SkipStream {
		streamHarnessAnswer(in.Emit, finalText, resolvedModel, lastRT, modeMultiAgent, len(picks))
	}

	return reactTurnResult{
		Text: finalText, Resolved: lastRT, ModelID: resolvedModel,
		ToolCalls: toolCalls, Steps: len(picks), Mode: modeMultiAgent,
		Agents: specialistMaps(picks),
	}
}

func specialistMaps(picks []specialistRef) []map[string]any {
	out := make([]map[string]any, 0, len(picks))
	for _, sp := range picks {
		out = append(out, map[string]any{
			"id": sp.ID, "name": sp.Name, "role": sp.Role, "department": sp.Department, "score": sp.Score,
		})
	}
	return out
}
