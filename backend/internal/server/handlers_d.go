package server

import (
	"encoding/json"
	"fmt"
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
	out := make([]map[string]any, 0)
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

func (s *Server) executeSkill(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "skill.execute") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权执行技能")
	}
	body, _ := decodeMap(r)
	skillID := str(body["skillId"])
	ws := s.workspaceID(r)
	commandOrTarget := coalesce(str(body["command"]), coalesce(str(body["endpoint"]), str(body["input"])))

	s.Store.Lock()
	_, sk := s.findSkillLocked(ws, skillID)
	if skillID == "" || sk == nil {
		s.Store.Unlock()
		return nil, apperr.NotFoundErr(apperr.NotFound, "技能不存在或不在当前工作区")
	}
	dec := s.evaluateSkillSandboxPolicyLocked(ws, skillID, commandOrTarget)
	govPolicy := s.ensureSkillGovernanceLocked(skillID)
	pkgPayload := skillPackagePayload(sk)
	if dec.Blocked {
		ev := s.Store.AppendAudit(ws, id.Name, "策略拦截技能执行", skillID, "failed", dec.Reason)
		s.appendSkillGovEventLocked(ws, str(sk["name"]), "policy", dec.Reason, id.Name, "blocked")
		s.Store.Unlock()
		if dec.RateLimited {
			return nil, errRateLimited(dec.Reason)
		}
		return nil, apperr.Forbidden(apperr.ZeroTrustDeny, dec.Reason+" (corr="+coalesce(str(ev["correlationId"]), dec.CorrelationID)+")")
	}
	s.Store.Unlock()

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
	token := auth.MintRunToken(skillID, ws, id.ID, 5*time.Minute)
	body["runToken"] = token
	body["denyControlPlane"] = true
	body["allowedEgress"] = govPolicy["allowedEgress"]
	body["correlationId"] = dec.CorrelationID
	if pkgPayload != nil {
		for k, v := range pkgPayload {
			body[k] = v
		}
	}
	result, runtimeErr := s.callSkillRuntime(body)
	status := "success"
	detail := "runtime=skill;runToken=issued;corr=" + dec.CorrelationID
	if runtimeErr != nil {
		status = "failed"
		detail = runtimeErr.Error()
		s.Store.Lock()
		s.Store.AppendAudit(ws, id.Name, "沙箱执行技能", skillID, status, detail)
		s.Store.Unlock()
		return nil, apperr.BadReq(apperr.BadRequest, "技能运行时不可用: "+runtimeErr.Error())
	}
	if b, ok := result["ok"].(bool); ok && !b {
		status = "failed"
		detail = coalesce(str(result["error"]), "skill runtime failed")
	}
	if stdout := str(result["stdout"]); stdout != "" {
		result["stdout"] = maskSkillOutput(stdout, boolFrom(govPolicy["dataMaskingEnabled"]))
	}
	result["correlationId"] = dec.CorrelationID
	s.Store.Lock()
	s.Store.AppendAudit(ws, id.Name, "沙箱执行技能", skillID, status, detail)
	s.Store.Unlock()
	return result, nil
}

func (s *Server) callSkillRuntime(body map[string]any) (map[string]any, error) {
	timeoutSec := 3
	if t := intFrom(body["timeoutSec"]); t > 0 && t <= 120 {
		timeoutSec = t
	}
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	payload, _ := json.Marshal(body)
	resp, err := client.Post(envOr("DE_SKILL_RUNTIME_URL", "http://127.0.0.1:8093")+"/v1/execute", "application/json", strings.NewReader(string(payload)))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var errBody map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&errBody)
		msg := coalesce(str(errBody["error"]), fmt.Sprintf("skill-runtime status %d", resp.StatusCode))
		return nil, fmt.Errorf("%s", msg)
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func skillTestSimEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(envOr("DE_SKILL_TEST_SIM", "1")))
	return v == "1" || v == "true" || v == "yes"
}

func (s *Server) memoryOverview(r *http.Request) (any, error) {
	return s.memoryOverviewAligned(r)
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
