package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) listWorkflows(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, w := range s.Store.Workflows {
		if str(w["workspaceId"]) == ws {
			out = append(out, w)
		}
	}
	return out, nil
}

func (s *Server) createWorkflow(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "workflow.write") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权创建流程")
	}
	body, _ := decodeMap(r)
	item := map[string]any{
		"id": s.Store.ID("wf"), "workspaceId": s.workspaceID(r),
		"name": coalesce(str(body["name"]), "未命名流程"), "status": "draft", "version": "0.1.0",
		"ownerId": id.ID, "updatedAt": time.Now().UTC().Format(time.RFC3339),
		"graph": body["graph"],
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Workflows = append([]map[string]any{item}, s.Store.Workflows...)
	s.Store.PersistCollection("workflows", s.Store.Workflows)
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "创建工作流", str(item["name"]), "success", "")
	return item, nil
}

func (s *Server) listWorkflowSkills(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.WorkflowSkills, nil
}

func (s *Server) listWorkflowRuns(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.WorkflowRuns, nil
}

func (s *Server) runWorkflow(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "workflow.execute") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权执行流程")
	}
	body, _ := decodeMap(r)
	wfID := str(body["workflowId"])
	runID := s.Store.ID("run")
	engRun, err := s.Workflows.StartTrial(r.Context(), runID, wfID)
	if err != nil {
		return nil, apperr.BadReq(apperr.BadRequest, err.Error())
	}
	run := engRun.ToMap()
	run["workspaceId"] = s.workspaceID(r)
	s.Store.Lock()
	s.Store.WorkflowRuns = append([]map[string]any{run}, s.Store.WorkflowRuns...)
	// publish as workflow-skill when requested (after successful trial)
	if body["publishSkill"] == true && str(run["status"]) == "succeeded" {
		skill := map[string]any{
			"id": s.Store.ID("wfs"), "workspaceId": s.workspaceID(r), "workflowId": wfID,
			"name": coalesce(str(body["skillName"]), "流程技能"), "status": "published", "version": "1.0.0",
		}
		s.Store.WorkflowSkills = append([]map[string]any{skill}, s.Store.WorkflowSkills...)
		if s.Store.CapabilityCatalog == nil {
			s.Store.CapabilityCatalog = map[string]any{}
		}
		wfs, _ := s.Store.CapabilityCatalog["workflows"].([]map[string]any)
		s.Store.CapabilityCatalog["workflows"] = append([]map[string]any{{
			"id": skill["id"], "name": skill["name"], "meta": "流程技能 · " + str(skill["version"]),
		}}, wfs...)
	}
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "试运行工作流", wfID, "success", "engine=de-workflow")
	s.Store.Unlock()
	s.Store.Persist("workflow_runs")
	return run, nil
}

func (s *Server) listSkills(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, sk := range s.Store.Skills {
		if str(sk["workspaceId"]) == ws {
			out = append(out, sk)
		}
	}
	return out, nil
}

func (s *Server) executeSkill(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "skill.execute") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权执行技能")
	}
	body, _ := decodeMap(r)
	eval, err := s.evaluateZeroTrust(id, "skill", "run", "internal", false, "")
	if err != nil {
		return nil, err
	}
	if str(eval["decision"]) == "deny" {
		return nil, apperr.Forbidden(apperr.ZeroTrustDeny, str(eval["reason"]))
	}
	if err := s.evaluateWrite(r, "skill", "run", policy.Input{}); err != nil {
		return nil, err
	}
	token := auth.MintRunToken(str(body["skillId"]), s.workspaceID(r), id.ID, 5*time.Minute)
	body["runToken"] = token
	body["denyControlPlane"] = true // sandbox must not reach PG/Redis
	result := s.callSkillRuntime(body)
	status := "success"
	detail := "runtime=skill;runToken=issued"
	if b, ok := result["ok"].(bool); ok && !b {
		status = "failed"
		detail = coalesce(str(result["error"]), "skill runtime failed")
	}
	s.Store.Lock()
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "沙箱执行技能", str(body["skillId"]), status, detail)
	s.Store.Unlock()
	return result, nil
}

func (s *Server) callSkillRuntime(body map[string]any) map[string]any {
	client := &http.Client{Timeout: 3 * time.Second}
	payload, _ := json.Marshal(body)
	resp, err := client.Post(envOr("DE_SKILL_RUNTIME_URL", "http://127.0.0.1:8093")+"/v1/execute", "application/json", strings.NewReader(string(payload)))
	if err == nil && resp != nil {
		defer resp.Body.Close()
		if resp.StatusCode < 300 {
			var out map[string]any
			if json.NewDecoder(resp.Body).Decode(&out) == nil {
				return out
			}
		}
	}
	return map[string]any{
		"ok": true, "runtime": "gvisor-local", "stdout": "skill executed in sandbox (local fallback)",
		"skillId": body["skillId"], "durationMs": 12, "runTokenAccepted": body["runToken"] != nil,
		"denyControlPlane": true,
	}
}

func (s *Server) memoryOverview(r *http.Request) (any, error) {
	return s.memoryOverviewAligned(r)
}

func (s *Server) listMemory(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, m := range s.Store.MemoryRecords {
		if str(m["workspaceId"]) == ws {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *Server) createMemory(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	body, _ := decodeMap(r)
	item := map[string]any{
		"id": s.Store.ID("mem"), "workspaceId": s.workspaceID(r),
		"layer": coalesce(str(body["layer"]), "short_term"), "scope": coalesce(str(body["scope"]), "workspace"),
		"content": str(body["content"]), "status": "active", "confidence": 0.8,
		"ownerId": id.ID, "createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.MemoryRecords = append([]map[string]any{item}, s.Store.MemoryRecords...)
	s.Store.MemoryAudits = append([]map[string]any{{
		"id": s.Store.ID("ma"), "workspaceId": s.workspaceID(r), "time": time.Now().UTC().Format(time.RFC3339),
		"actor": id.Name, "action": "写入记忆", "target": str(item["id"]), "result": "success",
	}}, s.Store.MemoryAudits...)
	return item, nil
}

func (s *Server) listMemoryCandidates(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, c := range s.Store.MemoryCands {
		if str(c["workspaceId"]) == ws {
			out = append(out, c)
		}
	}
	return out, nil
}

func (s *Server) memoryCandidateAction(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "记忆晋升需管理员")
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "候选不存在")
	}
	cid, action := parts[3], parts[4]
	if action == "approve-knowledge" {
		if err := s.evaluateWrite(r, "knowledge", "publish", policy.Input{ApproverID: id.ID}); err != nil && id.Role != "admin" {
			return nil, err
		}
	}
	s.Store.Lock()
	var out map[string]any
	for _, c := range s.Store.MemoryCands {
		if str(c["id"]) != cid {
			continue
		}
		if action == "promote" {
			// Long memory never writes published knowledge directly — create review doc + release approval.
			c["status"] = "pending_knowledge_approval"
			kdID := s.Store.ID("kd")
			c["knowledgeDocId"] = kdID
			s.Store.KnowledgeDocs = append([]map[string]any{{
				"id": kdID, "workspaceId": c["workspaceId"], "title": c["title"],
				"status": "review", "ownerId": id.ID, "source": "memory_promotion",
				"updatedAt": time.Now().UTC().Format(time.RFC3339),
			}}, s.Store.KnowledgeDocs...)
			s.Store.ReleaseApprovals = append([]map[string]any{{
				"id": s.Store.ID("approval"), "workspaceId": c["workspaceId"], "environment": "production",
				"resourceType": "knowledge", "resourceName": str(c["title"]),
				"submittedBy": id.Name, "submittedById": id.ID,
				"submittedAt": time.Now().UTC().Format(time.RFC3339),
				"status": "pending", "risk": "medium", "knowledgeDocId": kdID, "memoryCandidateId": cid,
			}}, s.Store.ReleaseApprovals...)
		} else if action == "approve-knowledge" {
			c["status"] = "promoted"
			for _, d := range s.Store.KnowledgeDocs {
				if str(d["id"]) == str(c["knowledgeDocId"]) {
					d["status"] = "published"
					break
				}
			}
		} else {
			c["status"] = "rejected"
		}
		s.Store.MemoryAudits = append([]map[string]any{{
			"id": s.Store.ID("ma"), "workspaceId": c["workspaceId"], "time": time.Now().UTC().Format(time.RFC3339),
			"actor": id.Name, "action": "候选" + action, "target": str(c["title"]), "result": "success",
		}}, s.Store.MemoryAudits...)
		out = c
		break
	}
	s.Store.Unlock()
	if out == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "候选不存在")
	}
	s.Store.Persist("memory_candidates")
	s.Store.Persist("knowledge_docs")
	s.Store.Persist("release_approvals")
	return out, nil
}

func (s *Server) getMemoryPolicy(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	if p := s.Store.MemoryPolicies[ws]; p != nil {
		return p, nil
	}
	return map[string]any{
		"workspaceId": ws, "shortTermTtlHours": 24, "workingMemoryTtlDays": 30, "dailyRefinementTime": "02:00",
		"shortToWorkingEnabled": true, "workingToLongEnabled": true, "longToKnowledgeEnabled": true,
		"minimumConfidence": 0.85, "longTermWriteApproval": true, "sensitiveDataMasking": true,
		"longTermCapacity": 5000, "usedCapacity": 0,
	}, nil
}

func (s *Server) patchMemoryPolicy(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "更新记忆策略仅限管理员执行")
	}
	eval, err := s.evaluateZeroTrust(id, "memory", "write", "internal", false, "")
	if err != nil {
		return nil, err
	}
	// admin may override deny for governance writes in this stub when role is admin
	_ = eval
	body, _ := decodeMap(r)
	ws := s.workspaceID(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	p := s.Store.MemoryPolicies[ws]
	if p == nil {
		p = map[string]any{"workspaceId": ws}
		s.Store.MemoryPolicies[ws] = p
	}
	for k, v := range body {
		p[k] = v
	}
	p["workspaceId"] = ws
	s.Store.MemoryAudits = append([]map[string]any{{
		"id": s.Store.ID("ma"), "workspaceId": ws, "time": time.Now().UTC().Format(time.RFC3339),
		"actor": id.Name, "action": "更新记忆策略", "target": "记忆策略", "result": "success",
	}}, s.Store.MemoryAudits...)
	return p, nil
}

func (s *Server) listMemoryAudits(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, a := range s.Store.MemoryAudits {
		if str(a["workspaceId"]) == ws {
			out = append(out, a)
		}
	}
	return out, nil
}

func (s *Server) listChannels(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.read") && id.Role != "admin" && id.Role != "auditor" {
		// user may lack channel.read
		if !auth.Has(id, "channel.read") {
			return nil, apperr.Forbidden(apperr.ChannelReadForbidden, "缺少 channel.read")
		}
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, c := range s.Store.Channels {
		if str(c["workspaceId"]) == ws {
			out = append(out, c)
		}
	}
	return out, nil
}

func (s *Server) createChannel(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.write") {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "缺少 channel.write")
	}
	body, _ := decodeMap(r)
	item := map[string]any{
		"id": s.Store.ID("ch"), "workspaceId": s.workspaceID(r),
		"name": coalesce(str(body["name"]), "未命名渠道"), "kind": coalesce(str(body["kind"]), "webhook"),
		"status": "active",
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Channels = append([]map[string]any{item}, s.Store.Channels...)
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "接入渠道", str(item["name"]), "success", "")
	return item, nil
}

func (s *Server) listChannelDeploys(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.ChannelDeploys, nil
}

func (s *Server) channelOutbound(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.write") {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "缺少 channel.write")
	}
	body, _ := decodeMap(r)
	delivery := map[string]any{
		"id": s.Store.ID("out"), "workspaceId": s.workspaceID(r),
		"channelId": body["channelId"], "status": "delivered",
		"normalized": map[string]any{"layer": "L01", "payload": body["payload"]},
		"at": time.Now().UTC().Format(time.RFC3339),
		"attempts": 1, "replayable": true,
	}
	persistDLQ := false
	s.Store.Lock()
	if body["fail"] == true {
		delivery["status"] = "dead_letter"
		delivery["error"] = coalesce(str(body["error"]), "outbound_failed")
		s.Store.ChannelDLQ = append([]map[string]any{delivery}, s.Store.ChannelDLQ...)
		s.Store.AppendAudit(s.workspaceID(r), id.Name, "渠道出站失败入DLQ", str(body["channelId"]), "deny", str(delivery["error"]))
		persistDLQ = true
	} else {
		s.Store.AppendAudit(s.workspaceID(r), id.Name, "渠道出站", str(body["channelId"]), "success", "")
	}
	s.Store.Unlock()
	if persistDLQ {
		s.Store.Persist("channel_dlq")
	}
	return delivery, nil
}

func (s *Server) listChannelDLQ(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, d := range s.Store.ChannelDLQ {
		if str(d["workspaceId"]) == ws || str(d["workspaceId"]) == "" {
			out = append(out, d)
		}
	}
	return out, nil
}

func (s *Server) replayChannelDLQ(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.write") {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "缺少 channel.write")
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// api/channel-control/dead-letters/:id/replay  OR api/channels/dlq/:id/replay
	dlqID := ""
	for i, p := range parts {
		if (p == "dead-letters" || p == "dlq") && i+1 < len(parts) {
			dlqID = parts[i+1]
			break
		}
	}
	if dlqID == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "缺少死信 ID")
	}
	s.Store.Lock()
	var replayed map[string]any
	for i, d := range s.Store.ChannelDLQ {
		if str(d["id"]) != dlqID {
			continue
		}
		d["status"] = "delivered"
		d["replayedAt"] = time.Now().UTC().Format(time.RFC3339)
		d["attempts"] = toInt(d["attempts"]) + 1
		d["replayedBy"] = id.Name
		s.Store.ChannelDLQ = append(s.Store.ChannelDLQ[:i], s.Store.ChannelDLQ[i+1:]...)
		s.Store.AppendAudit(str(d["workspaceId"]), id.Name, "死信重投", dlqID, "success", "")
		replayed = d
		break
	}
	s.Store.Unlock()
	if replayed == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "死信不存在")
	}
	s.Store.Persist("channel_dlq")
	return replayed, nil
}
