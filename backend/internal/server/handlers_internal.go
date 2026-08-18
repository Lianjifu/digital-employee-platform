package server

import (
	"net/http"

	"github.com/digital-employee-platform/backend/internal/auth"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) ensureChannelSessionAPI(r *http.Request) (any, error) {
	if r.Method != http.MethodPost {
		return nil, apperr.BadReq(apperr.BadRequest, "仅支持 POST")
	}
	body, _ := decodeMap(r)
	ws := coalesce(str(body["workspaceId"]), s.workspaceID(r))
	channel := str(body["channel"])
	threadID := coalesce(str(body["channelThreadId"]), str(body["threadId"]))
	deployID := coalesce(str(body["deploymentId"]), str(body["channelDeploymentId"]))
	employeeID := str(body["digitalEmployeeId"])
	actorID := str(body["actorId"])
	if actor := identityFrom(r.Context()); actor != nil && actorID == "" {
		actorID = actor.ID
	}
	sessID, convID, created := s.ensureChannelSession(ws, channel, threadID, deployID, employeeID, actorID)
	if sessID == "" {
		return nil, apperr.BadReq(apperr.ChannelThreadUnbound, "无法绑定渠道会话")
	}
	if created {
		s.Store.Persist("sessions")
		s.Store.Persist("conversations")
		s.Store.Persist("messages")
	}
	return map[string]any{
		"sessionId": sessID, "conversationId": convID, "created": created,
	}, nil
}

func (s *Server) upsertSkillCatalogAPI(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id == nil {
		return nil, apperr.UnauthorizedErr("请先登录")
	}
	body, _ := decodeMap(r)
	if str(body["id"]) == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "缺少技能 id")
	}
	s.Store.Lock()
	s.upsertSkillCatalogLocked(body)
	s.Store.Unlock()
	s.persistSkills()
	return body, nil
}

func (s *Server) upsertSkillCatalogLocked(item map[string]any) {
	if item == nil || !s.Store.CanWrite("skills") {
		return
	}
	sid := str(item["id"])
	if sid == "" {
		return
	}
	for _, existing := range s.Store.Skills {
		if str(existing["id"]) != sid {
			continue
		}
		for k, v := range item {
			existing[k] = v
		}
		return
	}
	s.Store.Skills = append([]map[string]any{cloneMap(item)}, s.Store.Skills...)
}

func (s *Server) applyWorkflowSkillCatalog(actor *auth.Identity, skill map[string]any, r *http.Request) {
	if skill == nil {
		return
	}
	item := cloneMap(skill)
	if str(item["kind"]) == "" {
		item["kind"] = "workflow"
	}
	if str(item["runtime"]) == "" {
		item["runtime"] = "de-workflow"
	}
	item["source"] = "workflow"
	if s.ownsCapRuntime() {
		s.Store.Lock()
		s.upsertSkillCatalogLocked(item)
		if str(item["lifecycleStatus"]) == "enabled" || str(item["status"]) == "published" {
			if s.Store.CapabilityCatalog == nil {
				s.Store.CapabilityCatalog = map[string]any{}
			}
			wfs, _ := s.Store.CapabilityCatalog["workflows"].([]map[string]any)
			sid := str(item["id"])
			found := false
			for _, w := range wfs {
				if str(w["id"]) == sid {
					found = true
					break
				}
			}
			if !found {
				s.Store.CapabilityCatalog["workflows"] = append([]map[string]any{{
					"id": sid, "name": str(item["name"]), "meta": "流程技能 · " + coalesce(str(item["version"]), "—"),
				}}, wfs...)
			}
		}
		s.Store.Unlock()
		s.persistSkills()
		return
	}
	if r == nil {
		r, _ = http.NewRequest(http.MethodPost, "/", nil)
	}
	if actor != nil && r.Header.Get("Authorization") == "" {
		r = s.requestWithActor(r, actor, str(item["workspaceId"]))
	}
	if _, err := s.peerPOST(r, capBaseURL(), "/api/internal/skill-catalog", item); err != nil {
		s.Store.AppendAudit(str(item["workspaceId"]), coalesce(actorName(actor), "workflow"), "同步流程技能目录失败", str(item["id"]), "failed", err.Error())
	}
}

func actorName(id *auth.Identity) string {
	if id == nil {
		return ""
	}
	return id.Name
}
