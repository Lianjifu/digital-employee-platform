package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) listModelProviders(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "model.read") {
		return nil, apperr.Forbidden(apperr.ModelReadForbidden, "缺少 model.read")
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, p := range s.Store.ModelProviders {
		if str(p["workspaceId"]) == ws {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *Server) createModelProvider(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "model.write") {
		return nil, apperr.Forbidden(apperr.ModelWriteForbidden, "缺少 model.write")
	}
	body, _ := decodeMap(r)
	apiKey := str(body["apiKey"])
	credRef := "vault:secret/data/models/" + s.Store.ID("cred")
	masked := ""
	if apiKey != "" {
		if s.Vault != nil {
			if err := s.Vault.Put(r.Context(), credRef, apiKey); err != nil {
				return nil, apperr.BadReq(apperr.BadRequest, "写入凭据失败")
			}
		}
		if len(apiKey) > 4 {
			masked = "sk-****" + apiKey[len(apiKey)-4:]
		} else {
			masked = "sk-****"
		}
	}
	item := map[string]any{
		"id": s.Store.ID("mp"), "workspaceId": s.workspaceID(r),
		"name": coalesce(str(body["name"]), "未命名供应商"), "vendor": coalesce(str(body["vendor"]), "custom"),
		"status": "active", "protocol": coalesce(str(body["protocol"]), "openai_compatible"),
		"endpoint": body["endpoint"], "apiKeyMasked": masked, "credentialRef": credRef,
		"dataResidency": coalesce(str(body["dataResidency"]), "cn"),
		"capabilities":  body["capabilities"],
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.ModelProviders = append([]map[string]any{item}, s.Store.ModelProviders...)
	s.Store.PersistCollection("model_providers", s.Store.ModelProviders)
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "接入模型供应商", str(item["name"]), "success", "credentialRef="+credRef)
	return item, nil
}

func (s *Server) listModelRoutes(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "model.read") {
		return nil, apperr.Forbidden(apperr.ModelReadForbidden, "缺少 model.read")
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, p := range s.Store.ModelRoutes {
		if str(p["workspaceId"]) == ws {
			out = append(out, p)
		}
	}
	return out, nil
}

func (s *Server) createModelRoute(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "model.write") {
		return nil, apperr.Forbidden(apperr.ModelWriteForbidden, "缺少 model.write")
	}
	body, _ := decodeMap(r)
	dataScope := coalesce(str(body["dataScope"]), "internal")
	egress := body["egressAllowed"] == true
	if err := s.evaluateWrite(r, "model", "run", policy.Input{
		DataClass: dataScope, EgressExternal: egress,
	}); err != nil {
		return nil, apperr.Forbidden(apperr.EgressBlocked, "受限数据不允许出境")
	}
	if dataScope == "restricted" && egress {
		return nil, apperr.Forbidden(apperr.EgressBlocked, "受限数据不允许出境")
	}
	limit := 100.0
	if n, ok := body["budgetLimitUsd"].(float64); ok {
		limit = n
	}
	if limit <= 0 {
		return nil, apperr.BadReq(apperr.BudgetExceeded, "预算必须大于 0")
	}
	item := map[string]any{
		"id": s.Store.ID("mr"), "workspaceId": s.workspaceID(r),
		"name": coalesce(str(body["name"]), "新路由"), "level": coalesce(str(body["level"]), "P1"),
		"primaryModelId": body["primaryModelId"], "fallbackModelIds": body["fallbackModelIds"],
		"budgetLimitUsd": limit, "dataScope": dataScope,
		"egressAllowed": egress, "status": "draft",
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.ModelRoutes = append([]map[string]any{item}, s.Store.ModelRoutes...)
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "创建模型路由", str(item["name"]), "success", "")
	return item, nil
}

func (s *Server) listModelBudgets(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "model.read") {
		return nil, apperr.Forbidden(apperr.ModelReadForbidden, "缺少 model.read")
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.ModelBudgets, nil
}

func (s *Server) listUsage(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	if s.UsageSink != nil {
		if rows, err := s.UsageSink.List(r.Context(), ws, 100); err == nil && len(rows) > 0 {
			return rows, nil
		}
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, u := range s.Store.UsageMeters {
		if str(u["workspaceId"]) == ws || str(u["workspaceId"]) == "" {
			out = append(out, u)
		}
	}
	return out, nil
}

func (s *Server) listKnowledgeDocs(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["workspaceId"]) == ws {
			out = append(out, d)
		}
	}
	return out, nil
}

func (s *Server) createKnowledgeDoc(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	body, _ := decodeMap(r)
	title := strings.TrimSpace(str(body["title"]))
	if title == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "文档标题必填")
	}
	ws := s.workspaceID(r)
	item := map[string]any{
		"id": s.Store.ID("kd"), "workspaceId": ws, "title": title,
		"source": coalesce(str(body["source"]), "upload"),
		"tags":   body["tags"],
		"status": "published",
		"createdAt": time.Now().UTC().Format(time.RFC3339),
		"updatedAt": time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	s.Store.KnowledgeDocs = append([]map[string]any{item}, s.Store.KnowledgeDocs...)
	s.Store.AppendAudit(ws, id.Name, "上传知识文档", title, "success", "")
	s.Store.Unlock()
	s.Store.Persist("knowledge_docs")
	s.syncRAGIndex(ws)
	return item, nil
}

func (s *Server) reindexKnowledge(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	n := s.syncRAGIndex(ws)
	s.Store.Lock()
	s.Store.AppendAudit(ws, id.Name, "重建知识索引", ws, "success", fmt.Sprintf("affected=%d", n))
	s.Store.Unlock()
	return map[string]any{"status": "ok", "affected": n}, nil
}

func (s *Server) syncRAGIndex(workspaceID string) int {
	client := &http.Client{Timeout: 3 * time.Second}
	s.Store.RLock()
	var docs []map[string]any
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["workspaceId"]) == workspaceID && str(d["status"]) == "published" {
			docs = append(docs, map[string]any{
				"docId": d["id"], "title": d["title"],
				"snippet": coalesce(str(d["snippet"]), "已发布："+str(d["title"])),
				"score": 0.9, "status": "published",
			})
		}
	}
	s.Store.RUnlock()
	payload, _ := json.Marshal(map[string]any{"docs": docs, "workspaceId": workspaceID})
	resp, err := client.Post(s.RAGURL+"/v1/ingest", "application/json", strings.NewReader(string(payload)))
	if err != nil {
		// fallback sync endpoint
		resp, err = client.Post(s.RAGURL+"/v1/sync", "application/json", strings.NewReader(string(payload)))
	}
	if err != nil || resp == nil {
		return len(docs)
	}
	defer resp.Body.Close()
	var out struct {
		Indexed int `json:"indexed"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out.Indexed > 0 {
		return out.Indexed
	}
	return len(docs)
}

func (s *Server) listKB(r *http.Request) (any, error) {
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.KBList, nil
}

func (s *Server) knowledgeRetrieve(r *http.Request) (any, error) {
	body, _ := decodeMap(r)
	corr := coalesce(str(body["correlationId"]), r.Header.Get("x-correlation-id"))
	if corr == "" {
		corr = s.Store.ID("corr")
	}
	return s.retrievePublished(r, body, corr)
}

func (s *Server) callRAG(query string) any {
	return s.callRAGPublished(query, "w1", s.Store.ID("corr"))
}

func (s *Server) listConversations(r *http.Request) (any, error) {
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	var out []map[string]any
	for _, c := range s.Store.Conversations {
		if str(c["workspaceId"]) == ws {
			out = append(out, c)
		}
	}
	return out, nil
}

func (s *Server) createConversation(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	body, _ := decodeMap(r)
	item := map[string]any{
		"id": s.Store.ID("conv"), "workspaceId": s.workspaceID(r),
		"title":             coalesce(str(body["title"]), "新会话"),
		"digitalEmployeeId": body["digitalEmployeeId"],
		"updatedAt":         time.Now().UTC().Format(time.RFC3339),
	}
	s.Store.Lock()
	s.Store.Conversations = append([]map[string]any{item}, s.Store.Conversations...)
	s.Store.AppendAudit(s.workspaceID(r), id.Name, "创建协作会话", str(item["title"]), "success", "")
	s.Store.Unlock()
	s.Store.Persist("conversations")
	return item, nil
}

func (s *Server) listMessages(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "会话不存在")
	}
	cid := parts[2]
	s.Store.RLock()
	defer s.Store.RUnlock()
	return s.Store.Messages[cid], nil
}

func (s *Server) copilotStream(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "会话不存在"))
		return
	}
	cid := parts[2]
	body, _ := decodeMap(r)
	userMsg := strings.TrimSpace(str(body["content"]))
	if userMsg == "" {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "消息不能为空"))
		return
	}
	corr := coalesce(str(body["correlationId"]), r.Header.Get("x-correlation-id"))
	if corr == "" {
		corr = s.Store.ID("corr")
	}
	ws := s.workspaceID(r)
	deID := coalesce(str(body["digitalEmployeeId"]), "")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, apperr.New(apperr.Unknown, 500, "流式不支持"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("x-correlation-id", corr)

	streamOK := false
	defer func() { IncCopilotStream(streamOK) }()

	emit := func(typ, stage string, extra map[string]any) {
		payload := map[string]any{"type": typ, "stage": stage, "correlationId": corr}
		for k, v := range extra {
			payload[k] = v
		}
		writeSSE(w, typ, payload)
		flusher.Flush()
	}

	// 1) policy
	emit("stage", "policy", map[string]any{"status": "running"})
	eval, err := s.evaluateZeroTrust(id, "session", "write", "internal", false, "")
	if err != nil {
		emit("error", "policy", map[string]any{"message": err.Error()})
		return
	}
	if str(eval["decision"]) == "deny" {
		emit("error", "policy", map[string]any{"message": str(eval["reason"])})
		return
	}
	emit("stage", "policy", map[string]any{"status": "ok", "decision": eval["decision"]})

	// 2) employee
	emit("stage", "employee", map[string]any{"status": "running"})
	emp, _ := s.resolveActiveEmployee(r, deID)
	empMap, _ := emp.(map[string]any)
	if empMap != nil && empMap["active"] == false && deID != "" {
		emit("error", "employee", map[string]any{"message": str(empMap["reason"])})
		return
	}
	emit("stage", "employee", map[string]any{"status": "ok", "employee": empMap})

	s.Store.Lock()
	s.Store.Messages[cid] = append(s.Store.Messages[cid], map[string]any{
		"id": s.Store.ID("msg"), "role": "user", "content": userMsg,
		"createdAt": time.Now().UTC().Format(time.RFC3339), "correlationId": corr,
	})
	s.Store.Unlock()
	s.Store.Persist("messages")

	// 3) rag (published only)
	emit("stage", "rag", map[string]any{"status": "running"})
	ragHits, _ := s.retrievePublished(r, map[string]any{"query": userMsg}, corr)
	emit("tool", "rag", map[string]any{"name": "knowledge.retrieve", "status": "ok", "hits": ragHits})
	emit("stage", "rag", map[string]any{"status": "ok"})

	// 4) runtime / model
	emit("stage", "runtime", map[string]any{"status": "running"})
	reply := s.runtimeReply(userMsg)
	if ragHits != nil {
		reply = reply + "\n\n（已检索已发布知识）"
	}
	for _, c := range chunkText(reply, 24) {
		emit("delta", "runtime", map[string]any{"text": c})
		time.Sleep(15 * time.Millisecond)
	}
	emit("stage", "runtime", map[string]any{"status": "ok"})

	// 5) meter (+ optional model budget hard gate)
	emit("stage", "meter", map[string]any{"status": "running"})
	units := len([]rune(reply))
	s.Store.Lock()
	budgetErr := s.checkModelBudgetLocked(ws)
	s.Store.Unlock()
	if budgetErr != nil {
		emit("error", "meter", map[string]any{"message": budgetErr.Error()})
		return
	}
	s.recordUsageWS(ws, "copilot", units, corr)
	emit("stage", "meter", map[string]any{"status": "ok", "units": units})
	emit("done", "done", map[string]any{"ok": true})
	streamOK = true

	s.Store.Lock()
	s.Store.Messages[cid] = append(s.Store.Messages[cid], map[string]any{
		"id": s.Store.ID("msg"), "role": "assistant", "content": reply,
		"createdAt": time.Now().UTC().Format(time.RFC3339), "correlationId": corr,
	})
	s.Store.AppendAudit(ws, id.Name, "协作回合", cid, "success", corr)
	s.Store.Unlock()
	s.Store.Persist("messages")
}

func (s *Server) runtimeReply(prompt string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	payload, _ := json.Marshal(map[string]any{"input": prompt})
	resp, err := client.Post(s.RuntimeURL+"/v1/invoke", "application/json", strings.NewReader(string(payload)))
	if err == nil && resp != nil {
		defer resp.Body.Close()
		if resp.StatusCode < 300 {
			b, _ := io.ReadAll(resp.Body)
			var out struct {
				Output string `json:"output"`
			}
			if json.Unmarshal(b, &out) == nil && out.Output != "" {
				return out.Output
			}
		}
	}
	return "（de-core 退化回复）已收到：" + prompt + "。建议结合知识检索与已上岗数字员工能力继续排查。"
}

func writeSSE(w http.ResponseWriter, event string, data any) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, string(b))
}

func chunkText(s string, n int) []string {
	runes := []rune(s)
	if n <= 0 {
		return []string{s}
	}
	var out []string
	for i := 0; i < len(runes); i += n {
		j := i + n
		if j > len(runes) {
			j = len(runes)
		}
		out = append(out, string(runes[i:j]))
	}
	return out
}

func (s *Server) recordUsage(kind string, units int) {
	s.recordUsageWS("w1", kind, units, "")
}

func (s *Server) recordUsageWS(workspaceID, kind string, units int, corr string) {
	s.Store.Lock()
	s.recordUsageLocked(workspaceID, kind, units, corr)
	s.Store.Unlock()
	if s.UsageSink != nil {
		_ = s.UsageSink.Record(context.Background(), workspaceID, kind, int64(units), map[string]any{
			"correlationId": corr,
		})
	}
	if s.Cache != nil {
		_, _ = s.Cache.IncrQuota(context.Background(), workspaceID, kind, int64(units))
	}
}

func (s *Server) recordUsageLocked(workspaceID, kind string, units int, corr string) {
	s.Store.UsageMeters = append([]map[string]any{{
		"id": s.Store.ID("usage"), "kind": kind, "units": units,
		"workspaceId": workspaceID, "at": time.Now().UTC().Format(time.RFC3339),
		"correlationId": corr,
	}}, s.Store.UsageMeters...)
}
