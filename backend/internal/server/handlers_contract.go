package server

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// --- Home ---

func (s *Server) ackAlertPath(r *http.Request) (any, error) {
	// Accept both /acknowledge (Mock) and /ack (legacy).
	return s.ackAlert(r)
}

// --- Tasks (ControlledTask) ---

func (s *Server) listTasksAligned(r *http.Request) (any, error) {
	return s.listTasks(r)
}

func (s *Server) createTaskAligned(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	if !auth.Has(id, "task.write") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权创建任务")
	}
	body, _ := decodeMap(r)
	title := strings.TrimSpace(str(body["title"]))
	if title == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "任务标题必填")
	}
	item := map[string]any{
		"id": s.Store.ID("task"), "workspaceId": ws, "code": "T-" + s.Store.ID("code"),
		"title": title, "priority": coalesce(str(body["priority"]), "P2"),
		"status": "pending", "lifecycleStage": "pending", "ownerId": id.ID,
		"digitalEmployeeId": body["digitalEmployeeId"], "source": coalesce(str(body["source"]), "manual"),
		"progress": map[string]any{"done": 0, "total": 1}, "tags": []string{},
		"sla": map[string]any{"remainingMin": 120, "risk": "none", "escalated": false},
		"execution": map[string]any{"retryCount": 0, "paused": false},
		"governance": map[string]any{"approvalRequired": false, "approvalStatus": "not_required"},
		"environment": coalesce(str(body["environment"]), "sandbox"),
		"classification": coalesce(str(body["classification"]), "internal"),
		"createdBy": id.ID, "createdAt": time.Now().UTC().Format(time.RFC3339),
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Tasks = append([]map[string]any{item}, s.Store.Tasks...)
	s.Store.AppendAudit(ws, id.Name, "创建任务", title, "success", "")
	return item, nil
}

func (s *Server) taskRoute(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// api/tasks/:id[/:action]
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "任务不存在")
	}
	tid := parts[2]
	action := ""
	if len(parts) >= 4 {
		action = parts[3]
	}
	id := identityFrom(r.Context())
	s.Store.Lock()
	defer s.Store.Unlock()
	var task map[string]any
	for _, t := range s.Store.Tasks {
		if str(t["id"]) == tid {
			task = t
			break
		}
	}
	if task == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "任务不存在")
	}
	if err := s.requireWorkspaceAccess(id, str(task["workspaceId"])); err != nil {
		return nil, err
	}
	if action == "" && r.Method == http.MethodGet {
		return task, nil
	}
	if action == "audit" && r.Method == http.MethodGet {
		return []map[string]any{{"id": "ta-1", "at": time.Now().UTC().Format(time.RFC3339), "actor": id.Name, "action": "查看审计", "tone": "info"}}, nil
	}
	body, _ := decodeMap(r)
	switch action {
	case "transition":
		if id.Role == "user" && str(task["ownerId"]) != id.ID {
			return nil, apperr.Forbidden(apperr.TaskOwnerScope, "只能流转自己负责的任务")
		}
		stage := coalesce(str(body["stage"]), coalesce(str(body["status"]), "pending"))
		nextStatus := mapStageToStatus(stage)
		if err := assertTaskTransition(str(task["status"]), nextStatus); err != nil {
			return nil, err
		}
		task["lifecycleStage"] = stage
		task["status"] = nextStatus
		task["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(task["workspaceId"]), id.Name, "任务流转", str(task["title"])+":"+stage, "success", "")
		if nextStatus == "completed" || nextStatus == "review" {
			s.writeTaskWorkingMemoryLocked(task, id, nextStatus)
		}
		return task, nil
	case "approve":
		if id.Role != "admin" {
			return nil, apperr.Forbidden(apperr.AdminRequired, "审批任务仅限管理员")
		}
		if err := s.evaluateWrite(r, "task", "approve", policy.Input{
			SubmitterID: str(task["ownerId"]), ApproverID: id.ID,
		}); err != nil {
			return nil, err
		}
		gov, _ := task["governance"].(map[string]any)
		if gov == nil {
			gov = map[string]any{}
			task["governance"] = gov
		}
		gov["approvalStatus"] = "approved"
		gov["approvalRequired"] = false
		task["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(task["workspaceId"]), id.Name, "任务审批", str(task["title"]), "success", "")
		return task, nil
	case "takeover", "retry":
		if id.Role != "admin" {
			return nil, apperr.Forbidden(apperr.AdminRequired, "操作仅限管理员")
		}
		if err := assertTaskTransition(str(task["status"]), "in_progress"); err != nil && str(task["status"]) != "in_progress" {
			// retry/takeover may force resume from review/pending
			if str(task["status"]) != "review" && str(task["status"]) != "pending" && str(task["status"]) != "in_progress" {
				return nil, err
			}
		}
		task["lifecycleStage"] = "running"
		task["status"] = "in_progress"
		if ex, ok := task["execution"].(map[string]any); ok {
			if action == "retry" {
				ex["retryCount"] = toInt(ex["retryCount"]) + 1
			}
			ex["paused"] = false
		}
		task["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(task["workspaceId"]), id.Name, "任务:"+action, str(task["title"]), "success", "")
		return task, nil
	default:
		// legacy start/review/complete…
		return s.taskTransitionLocked(task, action, body, id)
	}
}

func (s *Server) taskTransitionLocked(task map[string]any, action string, body map[string]any, id *auth.Identity) (any, error) {
	next := map[string]string{"start": "in_progress", "review": "review", "complete": "completed", "archive": "archived", "reopen": "pending"}[action]
	if next == "" {
		if st := str(body["status"]); st != "" {
			next = st
		} else {
			return nil, apperr.BadReq(apperr.BadRequest, "未知任务流转")
		}
	}
	if err := assertTaskTransition(str(task["status"]), next); err != nil {
		return nil, err
	}
	task["status"] = next
	task["lifecycleStage"] = mapStatusToStage(next)
	task["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	s.Store.AppendAudit(str(task["workspaceId"]), id.Name, "任务流转:"+action, str(task["title"]), "success", "")
	if next == "completed" || next == "review" {
		s.writeTaskWorkingMemoryLocked(task, id, next)
	}
	return task, nil
}

func (s *Server) writeTaskWorkingMemoryLocked(task map[string]any, id *auth.Identity, status string) {
	title := coalesce(str(task["code"]), str(task["id"])) + " · " + coalesce(str(task["title"]), "任务")
	content := "任务状态更新为 " + status + "；保留执行上下文以便人工接手与复盘。"
	if note := strings.TrimSpace(str(task["summary"])); note != "" {
		content = note + "\n" + content
	}
	_, _ = s.ingestRuntimeMemoryLocked(runtimeMemoryInput{
		WorkspaceID: str(task["workspaceId"]), OwnerID: coalesce(str(task["ownerId"]), id.ID), OwnerName: id.Name,
		DigitalEmployeeID: str(task["digitalEmployeeId"]),
		Title: title, Content: content,
		SourceType: "task", SourceID: str(task["id"]),
		CorrelationID: "corr_task_" + str(task["id"]),
		Layer: "working", Scope: "team", Confidence: 0.9,
	})
	go s.persistMemory()
}

func toInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}

func toFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case int64:
		return float64(t)
	default:
		return 0
	}
}

func mapStageToStatus(stage string) string {
	switch stage {
	case "running":
		return "in_progress"
	case "human_action", "risk":
		return "review"
	case "completed":
		return "completed"
	case "archived":
		return "archived"
	default:
		return "pending"
	}
}

func mapStatusToStage(status string) string {
	switch status {
	case "in_progress":
		return "running"
	case "review":
		return "human_action"
	case "completed":
		return "completed"
	case "archived":
		return "archived"
	default:
		return "pending"
	}
}

// --- Digital employees (Mock-shaped) ---

func (s *Server) employeeOverviewAligned(r *http.Request) (any, error) {
	list, err := s.listEmployees(r)
	if err != nil {
		return nil, err
	}
	items, _ := list.([]map[string]any)
	active, pending, anomalies := 0, 0, 0
	cost := 0.0
	for _, e := range items {
		if str(e["lifecycle"]) == "active" {
			active++
		}
		rel, _ := e["release"].(map[string]any)
		if str(e["lifecycle"]) == "pending_approval" || (rel != nil && str(rel["status"]) == "pending_approval") {
			pending++
		}
		rt, _ := e["runtime"].(map[string]any)
		if rt != nil {
			if n, ok := asFloat(rt["anomalies"]); ok && n > 0 {
				anomalies++
			}
			if c, ok := asFloat(rt["costToday"]); ok {
				cost += c
			}
		}
	}
	return map[string]any{
		"total": len(items), "active": active, "pending": pending,
		"anomalies": anomalies, "handoffAttention": 0, "costToday": cost,
	}, nil
}

func (s *Server) capabilityCatalogAligned(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.CapabilityCatalog, nil
}

func (s *Server) listTemplateAdoptions(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, a := range s.Store.TemplateAdoptions {
		if str(a["workspaceId"]) == ws {
			out = append(out, a)
		}
	}
	return out, nil
}

func (s *Server) digitalEmployeeRoute(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// api/digital-employees/:id/...
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.DigitalEmployeeNotFound, "数字员工不存在")
	}
	eid := parts[2]
	action, sub := "", ""
	if len(parts) >= 4 {
		action = parts[3]
	}
	if len(parts) >= 5 {
		sub = parts[4]
	}
	id := identityFrom(r.Context())
	s.Store.Lock()
	defer s.Store.Unlock()
	var emp map[string]any
	for _, e := range s.Store.Employees {
		if str(e["id"]) == eid {
			emp = e
			break
		}
	}
	if emp == nil {
		return nil, apperr.NotFoundErr(apperr.DigitalEmployeeNotFound, "数字员工不存在")
	}
	if err := s.requireWorkspaceAccess(id, str(emp["workspaceId"])); err != nil {
		return nil, err
	}

	if action == "" && r.Method == http.MethodGet {
		return emp, nil
	}
	if action == "evidence" && r.Method == http.MethodGet {
		return []map[string]any{
			{"id": "ev-1", "time": time.Now().UTC().Format(time.RFC3339), "actor": "系统", "action": "评测", "target": str(emp["name"]), "result": "success"},
		}, nil
	}
	if action == "runtime" && r.Method == http.MethodGet {
		return emp["runtime"], nil
	}
	if action == "configuration-versions" {
		if sub == "" && r.Method == http.MethodGet {
			var out []map[string]any
			for _, v := range s.Store.ConfigVersions {
				if str(v["employeeId"]) == eid {
					out = append(out, v)
				}
			}
			return out, nil
		}
		if sub != "" && len(parts) >= 6 && parts[5] == "approve" && r.Method == http.MethodPost {
			if id.Role != "admin" {
				return nil, apperr.Forbidden(apperr.AdminRequired, "批准员工受控配置变更")
			}
			for _, v := range s.Store.ConfigVersions {
				if str(v["id"]) != sub {
					continue
				}
				if str(v["updatedById"]) == id.ID {
					return nil, apperr.Forbidden(apperr.SODSelfApproval, "配置提交人不能批准自己的受控变更")
				}
				v["status"] = "current"
				v["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
				if draft := s.Store.ConfigDrafts[sub]; draft != nil {
					applyEmployeeConfig(emp, draft)
					delete(s.Store.ConfigDrafts, sub)
				}
				s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "批准员工受控配置变更", str(emp["name"]), "success", "")
				return v, nil
			}
			return nil, apperr.NotFoundErr(apperr.NotFound, "配置版本不存在")
		}
	}
	if action == "configuration" && r.Method == http.MethodPost {
		if id.Role == "auditor" {
			return nil, apperr.Forbidden(apperr.RoleForbidden, "无权写入数字员工")
		}
		body, _ := decodeMap(r)
		if err := validateEmployeeConfigurationBody(body); err != nil {
			return nil, err
		}
		requires := str(emp["lifecycle"]) == "active"
		if profile, ok := body["profile"].(map[string]any); ok {
			if str(profile["environment"]) == "production" || str(profile["risk"]) == "high" {
				requires = true
			}
		}
		ver := map[string]any{
			"id": s.Store.ID("cfg"), "employeeId": eid, "version": "配置 v" + itoa(len(s.Store.ConfigVersions)+1),
			"status": "current", "changeSummary": "更新岗位授权契约", "changedFields": []string{"岗位档案"},
			"updatedBy": id.Name, "updatedById": id.ID, "updatedAt": time.Now().UTC().Format(time.RFC3339),
			"requiresApproval": requires,
		}
		if requires {
			ver["status"] = "pending_approval"
			ver["changeSummary"] = "生产、在岗或高风险配置变更，等待审批后生效"
			s.Store.ConfigDrafts[str(ver["id"])] = body
		} else if profile, ok := body["profile"].(map[string]any); ok {
			for k, v := range profile {
				emp[k] = v
			}
		}
		s.Store.ConfigVersions = append([]map[string]any{ver}, s.Store.ConfigVersions...)
		s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "更新员工配置", str(emp["name"]), "success", "")
		return ver, nil
	}

	if id.Role == "auditor" && r.Method != http.MethodGet {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权写入数字员工")
	}
	body, _ := decodeMap(r)

	switch action {
	case "evaluate":
		incomplete := employeeEvaluateIncomplete(emp) || body["forceFail"] == true
		if incomplete {
			emp["evaluation"] = map[string]any{"status": "failed", "score": 68.0, "lastRunAt": time.Now().UTC().Format(time.RFC3339)}
		} else {
			emp["evaluation"] = map[string]any{"status": "passed", "score": 93.5, "lastRunAt": time.Now().UTC().Format(time.RFC3339)}
			if str(emp["lifecycle"]) == "draft" {
				emp["lifecycle"] = "testing"
			}
		}
	case "release":
		rel, _ := emp["release"].(map[string]any)
		if rel == nil {
			rel = map[string]any{}
			emp["release"] = rel
		}
		switch sub {
		case "withdraw":
			if str(rel["status"]) != "pending_approval" {
				return nil, apperr.BadReq(apperr.DigitalEmployeeInvalid, "仅待审批申请可撤回")
			}
			if str(rel["requestedById"]) != id.ID {
				return nil, apperr.Forbidden(apperr.RoleForbidden, "仅申请人可撤回上岗申请")
			}
			emp["release"] = map[string]any{"status": "not_released"}
			emp["lifecycle"] = "testing"
		case "reject":
			if id.Role != "admin" {
				return nil, apperr.Forbidden(apperr.AdminRequired, "驳回上岗申请")
			}
			if str(rel["requestedById"]) == id.ID {
				return nil, apperr.Forbidden(apperr.SODSelfApproval, "上岗申请人不能驳回自己的申请")
			}
			emp["release"] = map[string]any{"status": "not_released", "rejectedReason": coalesce(str(body["reason"]), "未满足上岗门禁"), "rejectedBy": id.Name}
			emp["lifecycle"] = "testing"
		default:
			if err := validateEmployeeReleaseGates(emp); err != nil {
				return nil, err
			}
			if err := s.evaluateWriteLocked(r, "employee", "release", policy.Input{SubmitterID: id.ID}); err != nil {
				return nil, err
			}
			emp["lifecycle"] = "pending_approval"
			emp["release"] = map[string]any{"status": "pending_approval", "requestedBy": id.Name, "requestedById": id.ID}
		}
	case "lifecycle":
		target := str(body["lifecycle"])
		rel, _ := emp["release"].(map[string]any)
		if target == "active" {
			if rel != nil && str(rel["status"]) == "pending_approval" {
				if id.Role != "admin" {
					return nil, apperr.Forbidden(apperr.AdminRequired, "确认双重审批上岗")
				}
				if str(rel["requestedById"]) == id.ID {
					return nil, apperr.Forbidden(apperr.SODSelfApproval, "上岗申请人不能批准自己的申请")
				}
				if err := s.evaluateWriteLocked(r, "employee", "approve", policy.Input{
					ApproverID: id.ID, SubmitterID: str(rel["requestedById"]),
				}); err != nil {
					return nil, err
				}
				emp["release"] = map[string]any{
					"status": "released", "releasedAt": time.Now().UTC().Format(time.RFC3339),
					"requestedBy": rel["requestedBy"], "requestedById": rel["requestedById"],
					"approver": id.Name, "approverId": id.ID,
				}
			} else if rel == nil || str(rel["status"]) != "released" {
				return nil, apperr.BadReq(apperr.DigitalEmployeePublish, "须先完成评测并经双重审批后方可上岗")
			}
		}
		if target == "paused" || target == "quarantined" {
			if id.Role != "admin" {
				return nil, apperr.Forbidden(apperr.AdminRequired, "暂停/隔离仅限管理员")
			}
			if strings.TrimSpace(str(body["reason"])) == "" {
				return nil, apperr.BadReq(apperr.BadRequest, "暂停/隔离须填写处置原因")
			}
		}
		if target != "" {
			emp["lifecycle"] = target
		}
	case "submit":
		if err := validateEmployeeReleaseGates(emp); err != nil {
			return nil, err
		}
		emp["lifecycle"] = "pending_approval"
		emp["release"] = map[string]any{"status": "pending_approval", "requestedBy": id.Name, "requestedById": id.ID}
	case "approve":
		if str(emp["ownerId"]) == id.ID {
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "创建者不能审批自己的生产发布")
		}
		rel, _ := emp["release"].(map[string]any)
		if rel != nil && str(rel["requestedById"]) == id.ID {
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "上岗申请人不能批准自己的申请")
		}
		submitter := str(emp["ownerId"])
		if rel != nil {
			submitter = coalesce(str(rel["requestedById"]), submitter)
		}
		if err := s.evaluateWriteLocked(r, "employee", "approve", policy.Input{
			ApproverID: id.ID, SubmitterID: submitter,
		}); err != nil {
			return nil, err
		}
		emp["lifecycle"] = "active"
		emp["release"] = map[string]any{"status": "released", "releasedAt": time.Now().UTC().Format(time.RFC3339), "approver": id.Name, "approverId": id.ID}
	case "reject":
		if str(emp["ownerId"]) == id.ID {
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "创建者不能审批自己的生产发布")
		}
		emp["lifecycle"] = "draft"
		emp["release"] = map[string]any{"status": "not_released"}
	case "pause":
		emp["lifecycle"] = "paused"
	default:
		if r.Method == http.MethodPatch {
			for _, k := range []string{"name", "role", "department", "description", "owner", "escalationOwner", "serviceObject", "risk", "environment"} {
				if body[k] != nil {
					emp[k] = body[k]
				}
			}
		} else if action != "" {
			return nil, apperr.NotFoundErr(apperr.NotFound, "未知数字员工动作")
		}
	}
	emp["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "数字员工:"+coalesce(action, "更新"), str(emp["name"]), "success", "")
	return emp, nil
}

func applyEmployeeConfig(emp map[string]any, draft map[string]any) {
	if profile, ok := draft["profile"].(map[string]any); ok {
		for k, v := range profile {
			emp[k] = v
		}
	}
	if caps, ok := draft["capabilities"]; ok {
		emp["capabilities"] = caps
	}
	if mem, ok := draft["memoryPolicy"]; ok {
		emp["memoryPolicy"] = mem
	}
}

func (s *Server) adoptTemplate(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role == "auditor" {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权采用模板")
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "模板不存在")
	}
	tid := parts[2]
	ws := s.workspaceID(r)
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	var tpl map[string]any
	for _, t := range s.Store.EmployeeTemplates {
		if str(t["id"]) == tid {
			tpl = t
			break
		}
	}
	if tpl == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "模板不存在")
	}
	emp := map[string]any{
		"id": s.Store.ID("de"), "workspaceId": ws, "name": coalesce(str(body["name"]), str(tpl["name"])),
		"role": tpl["role"], "department": coalesce(str(body["department"]), str(tpl["department"])),
		"description": tpl["description"], "owner": coalesce(str(body["owner"]), id.Name),
		"escalationOwner": coalesce(str(body["escalationOwner"]), "待指定"), "serviceObject": tpl["serviceObject"],
		"version": tpl["version"], "environment": coalesce(str(body["environment"]), "sandbox"),
		"lifecycle": "draft", "risk": tpl["risk"], "responsibilities": tpl["responsibilities"],
		"prohibitedActions": tpl["prohibitedActions"], "capabilities": tpl["capabilities"],
		"memoryPolicy": tpl["memoryPolicy"],
		"runtime": map[string]any{"calls24h": 0, "successRate": 0, "p95Ms": 0, "costToday": 0, "handoffs24h": 0, "anomalies": 0},
		"evaluation": map[string]any{"status": "not_started"}, "release": map[string]any{"status": "not_released"},
		"templateId": tid, "templateVersion": tpl["version"], "updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Employees = append([]map[string]any{emp}, s.Store.Employees...)
	tpl["adoptionCount"] = intFrom(tpl["adoptionCount"]) + 1
	s.Store.TemplateAdoptions = append([]map[string]any{{
		"id": s.Store.ID("adopt"), "templateId": tid, "templateVersion": tpl["version"],
		"employeeId": emp["id"], "workspaceId": ws, "adoptedBy": id.Name, "status": "draft",
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}}, s.Store.TemplateAdoptions...)
	s.Store.AppendAudit(ws, id.Name, "采用岗位模板", str(tpl["name"]), "success", "")
	return emp, nil
}

func intFrom(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int32:
		return int(t)
	case int64:
		return int(t)
	case float64:
		return int(t)
	case float32:
		return int(t)
	case string:
		n, err := strconv.Atoi(strings.TrimSpace(t))
		if err != nil {
			return 0
		}
		return n
	case json.Number:
		n, err := t.Int64()
		if err != nil {
			return 0
		}
		return int(n)
	default:
		return 0
	}
}

// Models handlers live in handlers_models.go

// Channel control handlers live in handlers_channels.go

// --- Copilot sessions / conversations ---

func (s *Server) listSessions(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, sess := range s.Store.Sessions {
		if str(sess["workspaceId"]) != ws {
			continue
		}
		cp := map[string]any{}
		for k, v := range sess {
			cp[k] = v
		}
		// 兼容精简种子：补齐前端会话列表所需字段，避免 Invalid Date 崩溃
		if str(cp["lastMessageAt"]) == "" {
			if v := str(cp["updatedAt"]); v != "" {
				cp["lastMessageAt"] = v
			} else if v := str(cp["createdAt"]); v != "" {
				cp["lastMessageAt"] = v
			}
		}
		if str(cp["createdAt"]) == "" {
			cp["createdAt"] = cp["lastMessageAt"]
		}
		if str(cp["updatedAt"]) == "" {
			cp["updatedAt"] = cp["lastMessageAt"]
		}
		if str(cp["preview"]) == "" {
			cp["preview"] = "暂无消息"
		}
		if str(cp["status"]) == "" {
			cp["status"] = "active"
		}
		if str(cp["agent"]) == "" {
			if name := str(cp["digitalEmployeeName"]); name != "" {
				cp["agent"] = name
			} else {
				cp["agent"] = "岗位专家"
			}
		}
		out = append(out, cp)
	}
	return out, nil
}

func (s *Server) listSlashCommands(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.SlashCommands, nil
}

func (s *Server) getConversation(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "会话不存在")
	}
	cid := parts[2]
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()

	findConversation := func(id string) map[string]any {
		for _, c := range s.Store.Conversations {
			if str(c["id"]) != id {
				continue
			}
			if w := str(c["workspaceId"]); w != "" && w != ws {
				return nil
			}
			cp := map[string]any{}
			for k, v := range c {
				cp[k] = v
			}
			if msgs, ok := s.Store.Messages[id]; ok {
				cp["messages"] = msgs
			} else if cp["messages"] == nil {
				cp["messages"] = []map[string]any{}
			}
			return cp
		}
		return nil
	}

	if cp := findConversation(cid); cp != nil {
		return cp, nil
	}

	// 兼容：前端可能用 session.id 拉详情；解析 session.conversationId 或返回空消息壳
	for _, sess := range s.Store.Sessions {
		if str(sess["id"]) != cid {
			continue
		}
		if str(sess["workspaceId"]) != ws {
			return nil, apperr.Forbidden(apperr.WorkspaceScope, "无权读取其他工作区会话")
		}
		convID := str(sess["conversationId"])
		if convID != "" {
			if cp := findConversation(convID); cp != nil {
				return cp, nil
			}
		}
		messages := s.Store.Messages[cid]
		if messages == nil && convID != "" {
			messages = s.Store.Messages[convID]
		}
		if messages == nil {
			messages = []map[string]any{}
		}
		outID := convID
		if outID == "" {
			outID = cid
		}
		updatedAt := str(sess["updatedAt"])
		if updatedAt == "" {
			updatedAt = str(sess["lastMessageAt"])
		}
		return map[string]any{
			"id":                outID,
			"workspaceId":       str(sess["workspaceId"]),
			"title":             sess["title"],
			"digitalEmployeeId": sess["digitalEmployeeId"],
			"updatedAt":         updatedAt,
			"messages":          messages,
		}, nil
	}

	return nil, apperr.NotFoundErr(apperr.NotFound, "会话不存在")
}

func (s *Server) conversationStream(w http.ResponseWriter, r *http.Request) {
	// Rewrite path to reuse copilotStream internals by temporarily adjusting URL.
	// /api/conversations/:id/stream → same logic
	s.copilotStream(w, r)
}

func (s *Server) conversationCreateTask(r *http.Request) (any, error) {
	body, _ := decodeMap(r)
	body["source"] = "conversation"
	body["title"] = coalesce(str(body["title"]), "协作派生任务")
	// reuse create via synthetic request body already decoded — call createTaskAligned with hijack
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	item := map[string]any{
		"id": s.Store.ID("task"), "workspaceId": ws, "code": "T-" + s.Store.ID("code"),
		"title": str(body["title"]), "priority": "P2", "status": "pending", "lifecycleStage": "pending",
		"ownerId": id.ID, "source": "conversation", "progress": map[string]any{"done": 0, "total": 1},
		"tags": []string{}, "sla": map[string]any{"remainingMin": 120, "risk": "none", "escalated": false},
		"execution": map[string]any{"retryCount": 0, "paused": false},
		"governance": map[string]any{"approvalRequired": false, "approvalStatus": "not_required"},
		"createdAt": time.Now().UTC().Format(time.RFC3339), "updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Tasks = append([]map[string]any{item}, s.Store.Tasks...)
	return item, nil
}
