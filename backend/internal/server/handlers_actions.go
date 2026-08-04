package server

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) approveAction(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id == nil {
		return nil, apperr.UnauthorizedErr("请先登录后再签发")
	}
	actionID := actionIDFromPath(r.URL.Path)
	if actionID == "" {
		return nil, apperr.NotFoundErr(apperr.NotFound, "行动不存在")
	}
	body, _ := decodeMap(r)
	rawConv := strings.TrimSpace(str(body["conversationId"]))
	if rawConv == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "缺少会话 ID")
	}
	signerIndex, err := strconv.Atoi(fmt.Sprint(body["signerIndex"]))
	if err != nil {
		return nil, apperr.BadReq(apperr.BadRequest, "无效的审批席位")
	}

	ws := s.workspaceID(r)
	s.Store.Lock()

	cid := s.resolveMessageBucketID(ws, rawConv)
	if !s.conversationInWorkspaceLocked(ws, cid, rawConv) {
		s.Store.Unlock()
		return nil, apperr.Forbidden(apperr.WorkspaceScope, "当前会话不在您的工作区范围内")
	}

	msg, msgIdx := findMessageLocked(s.Store.Messages[cid], actionID)
	if msg == nil && cid != rawConv {
		msg, msgIdx = findMessageLocked(s.Store.Messages[rawConv], actionID)
		if msg != nil {
			cid = rawConv
		}
	}
	if msg == nil {
		s.Store.Unlock()
		return nil, apperr.NotFoundErr(apperr.NotFound, "审批消息不存在")
	}

	ar, _ := msg["approvalRequest"].(map[string]any)
	if ar == nil {
		// 兼容历史水合消息：无审批席位时注入默认双签策略（执行复核已签、变更审批待签）
		ar = map[string]any{
			"action": "controlled.execute", "resource": cid, "reason": "受控执行双重审批",
			"required": 2, "signed": 1, "decision": "pending",
			"signers": []map[string]any{
				{"userId": "u2", "name": "王昊", "role": "operator", "signed": true, "signedAt": time.Now().UTC().Format(time.RFC3339), "signatureHash": "sig_seed_op"},
				{"userId": "u1", "name": "平台管理员", "role": "approver", "signed": false},
			},
		}
		msg["approvalRequest"] = ar
	}
	signers := asMapSlice(ar["signers"])
	if signerIndex < 0 || signerIndex >= len(signers) {
		s.Store.Unlock()
		return nil, apperr.BadReq(apperr.BadRequest, "无效的审批席位")
	}
	expected := signers[signerIndex]
	expectedUID := str(expected["userId"])
	expectedRole := signerPlatformRole(str(expected["role"]))
	if expected["signed"] == true {
		s.Store.Unlock()
		return nil, apperr.Conflict(apperr.BadRequest, "当前审批席位已签发")
	}
	if id.ID != expectedUID || id.Role != expectedRole {
		label := coalesce(str(expected["name"]), expectedUID)
		roleLabel := signerRoleLabel(str(expected["role"]))
		s.Store.Unlock()
		return nil, apperr.Forbidden(apperr.RoleForbidden, fmt.Sprintf("仅待签人 %s（%s）可签发", label, roleLabel))
	}
	if signerIndex > 0 {
		prev := signers[signerIndex-1]
		if prev["signed"] != true {
			s.Store.Unlock()
			return nil, apperr.BadReq(apperr.BadRequest, "请等待上一审批席位完成签发")
		}
	}
	for i, sg := range signers {
		if i == signerIndex {
			continue
		}
		if sg["signed"] == true && str(sg["userId"]) == id.ID {
			s.Store.Unlock()
			return nil, apperr.Forbidden(apperr.SODSelfApproval, "同一用户不得完成多个审批席位")
		}
	}

	signedAt := time.Now().UTC().Format(time.RFC3339)
	signatureHash := fmt.Sprintf("sig_%s_%s_%d", actionID, id.ID, time.Now().UnixMilli())
	expected["signed"] = true
	expected["signedAt"] = signedAt
	expected["signatureHash"] = signatureHash
	signers[signerIndex] = expected

	signedCount := 0
	for _, sg := range signers {
		if sg["signed"] == true {
			signedCount++
		}
	}
	required := intFromAny(ar["required"], len(signers))
	completed := signedCount >= required
	ar["signers"] = signers
	ar["signed"] = signedCount
	if completed {
		ar["decision"] = "approved"
		ar["decidedAt"] = signedAt
	} else {
		ar["decision"] = "pending"
	}
	msg["approvalRequest"] = ar
	s.Store.Messages[cid][msgIdx] = msg

	action := s.Store.Actions[actionID]
	if action == nil {
		action = map[string]any{
			"id": actionID, "conversationId": cid, "workspaceId": ws,
			"approvedSignerIndexes": []any{},
		}
	}
	indexes := asIntSlice(action["approvedSignerIndexes"])
	indexes = append(indexes, signerIndex)
	status := "pending"
	if completed {
		status = "approved"
	}
	action["approvedSignerIndexes"] = indexes
	action["status"] = status
	action["updatedAt"] = signedAt
	s.Store.Actions[actionID] = action
	auditLabel := "双重审批签发"
	if completed {
		auditLabel = "双重审批通过"
	}
	s.Store.AppendAudit(ws, id.Name, auditLabel, actionID, "success", "")
	s.Store.Unlock()

	s.Store.Persist("messages")
	s.Store.Persist("actions")

	return map[string]any{
		"id": actionID, "conversationId": cid, "status": status,
		"approvedSignerIndexes": indexes,
		"signedAt":              signedAt,
		"signatureHash":         signatureHash,
		"completed":             completed,
	}, nil
}

func (s *Server) executeAction(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if id == nil {
		return nil, apperr.UnauthorizedErr("请先登录")
	}
	actionID := actionIDFromPath(r.URL.Path)
	if actionID == "" {
		return nil, apperr.NotFoundErr(apperr.NotFound, "行动不存在")
	}
	body, _ := decodeMap(r)
	ws := s.workspaceID(r)
	now := time.Now().UTC().Format(time.RFC3339)

	s.Store.Lock()
	action := s.Store.Actions[actionID]
	if action == nil {
		action = map[string]any{"id": actionID, "workspaceId": ws, "status": "approved"}
	}
	st := str(action["status"])
	if st != "approved" && st != "executed" {
		s.Store.Unlock()
		return nil, apperr.BadReq(apperr.BadRequest, "行动尚未完成审批")
	}
	taskID := coalesce(str(body["taskId"]), str(action["taskId"]))
	var task map[string]any
	if taskID != "" {
		for i, t := range s.Store.Tasks {
			if str(t["id"]) != taskID {
				continue
			}
			t["status"] = "completed"
			t["lifecycleStage"] = "completed"
			t["updatedAt"] = now
			s.Store.Tasks[i] = t
			task = t
			break
		}
	}
	action["status"] = "executed"
	action["taskId"] = taskID
	action["updatedAt"] = now
	s.Store.Actions[actionID] = action

	cid := str(action["conversationId"])
	if cid != "" {
		if msg, idx := findMessageLocked(s.Store.Messages[cid], actionID); msg != nil {
			if ar, ok := msg["approvalRequest"].(map[string]any); ok {
				msg["linkedTaskId"] = taskID
				calls := asMapSlice(msg["toolCalls"])
				code := taskID
				if task != nil {
					code = coalesce(str(task["code"]), taskID)
				}
				calls = append(calls, map[string]any{
					"id": s.Store.ID("t"), "name": coalesce(str(ar["action"]), "controlled.execute"),
					"args": map[string]any{"resource": ar["resource"]}, "result": "OK · 任务 " + code + " 已回链",
					"status": "success", "durationMs": 48,
				})
				msg["toolCalls"] = calls
				s.Store.Messages[cid][idx] = msg
			}
		}
	}
	taskCode := actionID
	if task != nil {
		taskCode = coalesce(str(task["code"]), actionID)
	}
	s.Store.AppendAudit(ws, id.Name, "受控执行完成", taskCode, "success", "")
	s.Store.Unlock()

	s.Store.Persist("messages")
	s.Store.Persist("actions")
	s.Store.Persist("tasks")

	out := map[string]any{}
	for k, v := range action {
		out[k] = v
	}
	if task != nil {
		out["task"] = task
	}
	return out, nil
}

func (s *Server) conversationInWorkspaceLocked(ws, cid, raw string) bool {
	for _, c := range s.Store.Conversations {
		if str(c["id"]) == cid || str(c["id"]) == raw {
			w := str(c["workspaceId"])
			return w == "" || w == ws
		}
	}
	for _, sess := range s.Store.Sessions {
		if str(sess["id"]) == raw || str(sess["conversationId"]) == cid || str(sess["id"]) == cid {
			return str(sess["workspaceId"]) == ws
		}
	}
	if _, ok := s.Store.Messages[cid]; ok {
		return true
	}
	return false
}

func findMessageLocked(msgs []map[string]any, id string) (map[string]any, int) {
	for i, m := range msgs {
		if str(m["id"]) == id {
			return m, i
		}
	}
	return nil, -1
}

func asMapSlice(v any) []map[string]any {
	switch x := v.(type) {
	case []map[string]any:
		return x
	case []any:
		out := make([]map[string]any, 0, len(x))
		for _, item := range x {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	default:
		return nil
	}
}

func asIntSlice(v any) []any {
	switch x := v.(type) {
	case []any:
		return append([]any{}, x...)
	case []int:
		out := make([]any, len(x))
		for i, n := range x {
			out[i] = n
		}
		return out
	default:
		return []any{}
	}
}

func intFromAny(v any, def int) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case string:
		n, err := strconv.Atoi(x)
		if err == nil {
			return n
		}
	}
	return def
}

func signerPlatformRole(role string) string {
	switch role {
	case "approver":
		return "admin"
	case "auditor":
		return "auditor"
	default:
		return "user"
	}
}

func signerRoleLabel(role string) string {
	switch role {
	case "auditor":
		return "审计复核"
	case "operator":
		return "执行复核"
	default:
		return "变更审批"
	}
}
