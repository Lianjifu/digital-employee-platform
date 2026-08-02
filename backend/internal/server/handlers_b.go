package server

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) listEmployees(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	if err := s.requireWorkspaceAccess(id, ws); err != nil {
		return nil, err
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, e := range s.Store.Employees {
		if str(e["workspaceId"]) == ws {
			out = append(out, e)
		}
	}
	return out, nil
}

func (s *Server) employeeOverview(r *http.Request) (any, error) {
	return s.employeeOverviewAligned(r)
}

func (s *Server) listEmployeeTemplates(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.EmployeeTemplates, nil
}

func (s *Server) capabilityCatalog(r *http.Request) (any, error) {
	return s.capabilityCatalogAligned(r)
}

func (s *Server) getEmployee(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	eid := strings.TrimPrefix(r.URL.Path, "/api/digital-employees/")
	if i := strings.Index(eid, "/"); i >= 0 {
		eid = eid[:i]
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	for _, e := range s.Store.Employees {
		if str(e["id"]) == eid {
			if err := s.requireWorkspaceAccess(id, str(e["workspaceId"])); err != nil {
				return nil, err
			}
			return e, nil
		}
	}
	return nil, apperr.NotFoundErr(apperr.DigitalEmployeeNotFound, "数字员工不存在")
}

func (s *Server) createEmployee(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	if err := s.requireWorkspaceAccess(id, ws); err != nil {
		return nil, err
	}
	if !auth.Has(id, "agent.write") {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "无权创建数字员工")
	}
	body, _ := decodeMap(r)
	name := strings.TrimSpace(str(body["name"]))
	if name == "" {
		return nil, apperr.BadReq(apperr.DigitalEmployeeInvalid, "名称必填")
	}
	item := map[string]any{
		"id": s.Store.ID("de"), "workspaceId": ws, "name": name,
		"role": coalesce(str(body["role"]), "general"), "department": coalesce(str(body["department"]), "未分配"),
		"description": coalesce(str(body["description"]), "待完善岗位职责说明。"),
		"owner": id.Name, "ownerId": id.ID, "escalationOwner": coalesce(str(body["escalationOwner"]), "待指定"),
		"serviceObject": coalesce(str(body["serviceObject"]), "内部用户"),
		"version": "0.1.0", "environment": "sandbox", "lifecycle": "draft", "risk": coalesce(str(body["risk"]), "low"),
		"responsibilities": []string{"待配置岗位职责"}, "prohibitedActions": []string{"待配置禁止行为"},
		"capabilities": body["capabilities"],
		"memoryPolicy": map[string]any{"shortTermHours": 24, "workingDays": 7, "longTermCadence": "daily", "knowledgePromotion": "approval_required"},
		"runtime": map[string]any{"calls24h": 0, "successRate": 0, "p95Ms": 0, "costToday": 0, "handoffs24h": 0, "anomalies": 0},
		"evaluation": map[string]any{"status": "not_started"}, "release": map[string]any{"status": "not_released"},
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	if item["capabilities"] == nil {
		item["capabilities"] = map[string]any{"model": "企业通用路由 v2", "knowledge": []string{}, "skills": []string{}, "tools": []string{}, "workflows": []string{}, "channels": []string{"Web"}}
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Employees = append([]map[string]any{item}, s.Store.Employees...)
	s.Store.AppendAudit(ws, id.Name, "创建数字员工草稿", name, "success", "")
	return item, nil
}

func (s *Server) patchEmployee(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	eid := strings.TrimPrefix(r.URL.Path, "/api/digital-employees/")
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	for _, e := range s.Store.Employees {
		if str(e["id"]) != eid {
			continue
		}
		if err := s.requireWorkspaceAccess(id, str(e["workspaceId"])); err != nil {
			return nil, err
		}
		for k, v := range body {
			if k == "id" || k == "workspaceId" {
				continue
			}
			e[k] = v
		}
		e["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(e["workspaceId"]), id.Name, "更新数字员工配置", str(e["name"]), "success", "")
		return e, nil
	}
	return nil, apperr.NotFoundErr(apperr.DigitalEmployeeNotFound, "数字员工不存在")
}

func (s *Server) employeeAction(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	// api/digital-employees/:id/:action
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "无效动作")
	}
	eid, action := parts[2], parts[3]
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
	switch action {
	case "submit":
		if err := s.validatePublishedCapabilities(emp); err != nil {
			return nil, err
		}
		emp["lifecycle"] = "pending_approval"
		emp["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.ReleaseApprovals = append([]map[string]any{{
			"id": s.Store.ID("approval"), "workspaceId": emp["workspaceId"], "environment": "production",
			"resourceType": "agent", "resourceName": str(emp["name"]) + " " + str(emp["version"]),
			"submittedBy": id.Name, "submittedById": id.ID, "submittedAt": time.Now().UTC().Format(time.RFC3339),
			"status": "pending", "risk": emp["risk"], "correlationId": s.Store.ID("corr"),
			"digitalEmployeeId": eid,
		}}, s.Store.ReleaseApprovals...)
		s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "提交数字员工上岗审批", str(emp["name"]), "success", "")
		return emp, nil
	case "approve":
		if !auth.Has(id, "release.approve") && id.Role != "admin" {
			return nil, apperr.Forbidden(apperr.ReleaseApproveForbidden, "无权审批上岗")
		}
		if str(emp["ownerId"]) == id.ID {
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "创建者不能审批自己的生产发布")
		}
		if err := s.evaluateWrite(r, "employee", "approve", policy.Input{
			SubmitterID: str(emp["ownerId"]), ApproverID: id.ID, PublishedBinding: true,
		}); err != nil {
			return nil, err
		}
		if err := s.validatePublishedCapabilities(emp); err != nil {
			return nil, err
		}
		emp["lifecycle"] = "active"
		emp["version"] = strings.TrimSuffix(str(emp["version"]), "-draft")
		emp["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "批准数字员工上岗", str(emp["name"]), "success", "")
		return emp, nil
	case "reject":
		if !auth.Has(id, "release.approve") && id.Role != "admin" {
			return nil, apperr.Forbidden(apperr.ReleaseApproveForbidden, "无权驳回")
		}
		if str(emp["ownerId"]) == id.ID {
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "创建者不能审批自己的生产发布")
		}
		emp["lifecycle"] = "draft"
		emp["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "驳回数字员工上岗", str(emp["name"]), "success", "")
		return emp, nil
	case "pause":
		emp["lifecycle"] = "paused"
		s.Store.AppendAudit(str(emp["workspaceId"]), id.Name, "暂停数字员工", str(emp["name"]), "success", "")
		return emp, nil
	default:
		return nil, apperr.NotFoundErr(apperr.NotFound, "未知动作")
	}
}

func (s *Server) validatePublishedCapabilities(emp map[string]any) error {
	caps, _ := emp["capabilities"].(map[string]any)
	if caps == nil {
		return nil
	}
	// Mock-shaped capabilities use display names / catalog options; allow non-empty model.
	if str(caps["model"]) == "" && str(caps["modelRouteId"]) == "" {
		return apperr.BadReq(apperr.DigitalEmployeeBinding, "须装配已发布模型")
	}
	return nil
}

func (s *Server) listTasks(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	if err := s.requireWorkspaceAccess(id, ws); err != nil {
		return nil, err
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, t := range s.Store.Tasks {
		if str(t["workspaceId"]) != ws {
			continue
		}
		if id.Role == "user" && str(t["ownerId"]) != id.ID && !auth.Has(id, "task.read") {
			continue
		}
		out = append(out, t)
	}
	return out, nil
}

func (s *Server) createTask(r *http.Request) (any, error) {
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
		"id": s.Store.ID("task"), "workspaceId": ws, "code": fmt.Sprintf("T-%d", time.Now().Unix()%100000),
		"title": title, "status": "pending", "priority": coalesce(str(body["priority"]), "P2"),
		"ownerId": id.ID, "ownerName": id.Name, "digitalEmployeeId": body["digitalEmployeeId"],
		"createdAt": time.Now().UTC().Format(time.RFC3339), "updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.Tasks = append([]map[string]any{item}, s.Store.Tasks...)
	s.Store.AppendAudit(ws, id.Name, "创建任务", title, "success", "")
	return item, nil
}

func (s *Server) taskTransition(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "无效任务动作")
	}
	tid, action := parts[2], parts[3]
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	for _, t := range s.Store.Tasks {
		if str(t["id"]) != tid {
			continue
		}
		if err := s.requireWorkspaceAccess(id, str(t["workspaceId"])); err != nil {
			return nil, err
		}
		if id.Role == "user" && str(t["ownerId"]) != id.ID && action != "comment" {
			return nil, apperr.Forbidden(apperr.TaskOwnerScope, "只能流转自己负责的任务")
		}
		next := map[string]string{
			"start": "in_progress", "review": "review", "complete": "completed",
			"archive": "archived", "reopen": "pending",
		}[action]
		if next == "" {
			if st := str(body["status"]); st != "" {
				next = st
			} else {
				return nil, apperr.BadReq(apperr.BadRequest, "未知任务流转")
			}
		}
		t["status"] = next
		t["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		s.Store.AppendAudit(str(t["workspaceId"]), id.Name, "任务流转:"+action, str(t["title"]), "success", "")
		return t, nil
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "任务不存在")
}

func (s *Server) legacyAgentsProxy(r *http.Request) (any, error) {
	// Deprecated /api/agents — read-only projection of digital employees.
	list, err := s.listEmployees(r)
	if err != nil {
		return nil, err
	}
	items, _ := list.([]map[string]any)
	out := make([]map[string]any, 0, len(items))
	for _, e := range items {
		out = append(out, map[string]any{
			"id": e["id"], "name": e["name"], "workspaceId": e["workspaceId"],
			"status": e["lifecycle"], "ownerId": e["ownerId"], "legacy": true,
		})
	}
	return out, nil
}
