package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) knowledgeExtra(key string) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	if v, ok := s.Store.KnowledgeExtra[key]; ok {
		return v, nil
	}
	return []any{}, nil
}

func (s *Server) knowledgeDocDetail(r *http.Request) (any, error) {
	id := strings.TrimPrefix(r.URL.Path, "/api/knowledge/doc/")
	s.Store.RLock()
	defer s.Store.RUnlock()
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["id"]) == id {
			return d, nil
		}
	}
	return map[string]any{"id": id, "title": "文档", "status": "published"}, nil
}

func (s *Server) patchKnowledgeGovernance(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "更新知识治理")
	}
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	gov, _ := s.Store.KnowledgeExtra["governance"].(map[string]any)
	if gov == nil {
		gov = map[string]any{"workspaceId": s.workspaceID(r)}
	}
	for k, v := range body {
		gov[k] = v
	}
	s.Store.KnowledgeExtra["governance"] = gov
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "更新知识治理", "governance", "success", "")
	return gov, nil
}

func (s *Server) workflowByID(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "流程不存在")
	}
	wid := parts[2]
	action := ""
	if len(parts) >= 4 {
		action = parts[3]
	}
	id := identityFrom(r.Context())
	s.Store.Lock()
	defer s.Store.Unlock()
	var wf map[string]any
	for _, w := range s.Store.Workflows {
		if str(w["id"]) == wid {
			wf = w
			break
		}
	}
	if wf == nil && action == "" {
		return nil, apperr.NotFoundErr(apperr.NotFound, "流程不存在")
	}
	if action == "" {
		return wf, nil
	}
	body, _ := decodeMap(r)
	switch action {
	case "versions":
		if r.Method == http.MethodGet {
			return s.Store.WorkflowVersions[wid], nil
		}
		ver := map[string]any{"id": s.Store.ID("wfv"), "workflowId": wid, "version": coalesce(str(body["version"]), "0.1.0"), "status": "draft", "createdAt": time.Now().UTC().Format(time.RFC3339)}
		s.Store.WorkflowVersions[wid] = append([]map[string]any{ver}, s.Store.WorkflowVersions[wid]...)
		return ver, nil
	case "draft":
		for k, v := range body {
			wf[k] = v
		}
		wf["status"] = "draft"
		wf["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		return wf, nil
	case "validate":
		return map[string]any{"ok": true, "issues": []string{}}, nil
	case "publish":
		if err := s.evaluateWriteLocked(r, "workflow", "publish", policy.Input{ApproverID: id.ID, SubmitterID: id.ID}); err != nil {
			return nil, err
		}
		wf["status"] = "active"
		wf["lifecycleStatus"] = "published"
		s.Store.AppendAudit(s.workspaceID(r), id.Name, "发布工作流", str(wf["name"]), "success", "")
		return wf, nil
	case "run":
		run := map[string]any{"id": s.Store.ID("run"), "workspaceId": s.workspaceID(r), "workflowId": wid, "status": "succeeded", "startedAt": time.Now().UTC().Format(time.RFC3339), "finishedAt": time.Now().UTC().Format(time.RFC3339)}
		s.Store.WorkflowRuns = append([]map[string]any{run}, s.Store.WorkflowRuns...)
		return run, nil
	case "rollback":
		return wf, nil
	case "publish-as-skill":
		skill := map[string]any{"id": s.Store.ID("wfs"), "workspaceId": s.workspaceID(r), "workflowId": wid, "name": coalesce(str(body["name"]), str(wf["name"])+"技能"), "status": "published", "version": "1.0.0"}
		s.Store.WorkflowSkills = append([]map[string]any{skill}, s.Store.WorkflowSkills...)
		return skill, nil
	}
	if strings.HasPrefix(action, "runs") {
		return s.Store.WorkflowRuns, nil
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "未知流程动作")
}

func (s *Server) listWorkflowTemplates(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.WorkflowTpls, nil
}

func (s *Server) listWorkflowGenerations(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.WorkflowGens, nil
}

func (s *Server) generateWorkflow(r *http.Request) (any, error) {
	body, _ := decodeMap(r)
	item := map[string]any{
		"id": s.Store.ID("gen"), "prompt": body["prompt"], "status": "ready",
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.WorkflowGens = append([]map[string]any{item}, s.Store.WorkflowGens...)
	return item, nil
}

func (s *Server) skillsGovernanceOverview(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.SkillGovernance, nil
}

func (s *Server) listSkillCatalog(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.SkillCatalog, nil
}

func (s *Server) listSkillsAligned(r *http.Request) (any, error) {
	return s.listSkills(r)
}

func (s *Server) memoryOverviewAligned(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	short, working, long, pending := 0, 0, 0, 0
	for _, m := range s.Store.MemoryRecords {
		if str(m["workspaceId"]) != ws {
			continue
		}
		switch str(m["layer"]) {
		case "short_term":
			short++
		case "working":
			working++
		case "long_term":
			long++
		}
	}
	for _, c := range s.Store.MemoryCands {
		if str(c["workspaceId"]) == ws && str(c["status"]) == "pending" {
			pending++
		}
	}
	return map[string]any{
		"totals": map[string]any{
			"shortTerm": short, "working": working, "longTerm": long, "pendingCandidates": pending,
		},
		"policy": s.Store.MemoryPolicies[ws],
	}, nil
}

func (s *Server) memoryRecordAction(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "记忆不存在")
	}
	mid, action := parts[3], ""
	if len(parts) >= 5 {
		action = parts[4]
	}
	id := identityFrom(r.Context())
	s.Store.Lock()
	defer s.Store.Unlock()
	for i, m := range s.Store.MemoryRecords {
		if str(m["id"]) != mid {
			continue
		}
		switch {
		case action == "expire" && r.Method == http.MethodPost:
			m["status"] = "expired"
			return m, nil
		case action == "candidate" && r.Method == http.MethodPost:
			cand := map[string]any{"id": s.Store.ID("mc"), "workspaceId": m["workspaceId"], "memoryId": mid, "title": "记忆候选", "status": "pending", "confidence": m["confidence"]}
			s.Store.MemoryCands = append([]map[string]any{cand}, s.Store.MemoryCands...)
			return cand, nil
		case r.Method == http.MethodDelete:
			s.Store.MemoryRecords = append(s.Store.MemoryRecords[:i], s.Store.MemoryRecords[i+1:]...)
			return map[string]any{"id": mid}, nil
		}
	}
	_ = id
	return nil, apperr.NotFoundErr(apperr.NotFound, "记忆不存在")
}

func (s *Server) memoryCandidateActionAligned(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "候选不存在")
	}
	cid, action := parts[3], parts[4]
	// approve|reject|promote
	if action == "approve" {
		action = "promote"
	}
	id := identityFrom(r.Context())
	if id.Role != "admin" && action == "promote" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "记忆晋升需管理员")
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	for _, c := range s.Store.MemoryCands {
		if str(c["id"]) != cid {
			continue
		}
		if action == "promote" {
			c["status"] = "promoted"
		} else {
			c["status"] = "rejected"
		}
		return c, nil
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "候选不存在")
}

func (s *Server) memoryRefinement(r *http.Request) (any, error) {
	return map[string]any{
		"scheduledFor": time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339),
		"workingCreated": 1, "longCreated": 0, "candidatesCreated": 1,
	}, nil
}

func (s *Server) listNotificationChannels(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.NotificationChannels, nil
}

func (s *Server) getTenantProfile(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	if s.Store.TenantProfile == nil {
		return map[string]any{"name": "ACME Corp", "tenantId": "tenant-acme", "region": "cn-east-1"}, nil
	}
	out := map[string]any{}
	for k, v := range s.Store.TenantProfile {
		out[k] = v
	}
	return out, nil
}

func (s *Server) patchTenantProfile(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "仅管理员可更新组织资料")
	}
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	if s.Store.TenantProfile == nil {
		s.Store.TenantProfile = map[string]any{}
	}
	for _, k := range []string{"name", "region", "status"} {
		if v := strings.TrimSpace(str(body[k])); v != "" {
			s.Store.TenantProfile[k] = v
		}
	}
	s.Store.TenantProfile["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
	s.Store.TenantProfile["updatedBy"] = id.Name
	s.Store.AppendAudit("tenant", id.Name, "更新组织资料", str(s.Store.TenantProfile["name"]), "success", "")
	out := map[string]any{}
	for k, v := range s.Store.TenantProfile {
		out[k] = v
	}
	return out, nil
}

func (s *Server) patchNotificationChannel(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.AdminRequired, "仅管理员可配置通知渠道")
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "通知渠道不存在")
	}
	cid := parts[2]
	body, _ := decodeMap(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	for _, ch := range s.Store.NotificationChannels {
		if str(ch["id"]) != cid {
			continue
		}
		if _, ok := body["enabled"]; ok {
			ch["enabled"] = body["enabled"] == true || str(body["enabled"]) == "true"
		}
		if v := strings.TrimSpace(str(body["name"])); v != "" {
			ch["name"] = v
		}
		s.Store.AppendAudit(s.workspaceID(r), id.Name, "更新通知渠道", cid, "success", "")
		return ch, nil
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "通知渠道不存在")
}

func (s *Server) listAPIKeys(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.APIKeys, nil
}

func (s *Server) listWebhooksConfig(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.WebhooksConfig, nil
}

func (s *Server) emptyOK(r *http.Request) (any, error) { return []any{}, nil }

func (s *Server) skillsGovernanceEmpty(r *http.Request) (any, error) {
	return []any{}, nil
}
