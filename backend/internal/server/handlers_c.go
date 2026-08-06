package server

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/modelprov"
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
	out := make([]map[string]any, 0)
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["workspaceId"]) != ws {
			continue
		}
		cp := map[string]any{}
		for k, v := range d {
			cp[k] = v
		}
		// 对齐前端 KnowledgeDoc：补齐来源/状态/规模字段，避免列表渲染缺 key、Invalid Date 等
		if str(cp["source"]) == "" {
			cp["source"] = "平台知识库"
		}
		status := str(cp["status"])
		switch status {
		case "published", "ready":
			cp["status"] = "ready"
		case "indexing", "processing", "queued":
			cp["status"] = "indexing"
		case "review", "draft":
			cp["status"] = "indexing"
		default:
			if status == "" {
				cp["status"] = "ready"
			}
		}
		if cp["sizeKb"] == nil {
			cp["sizeKb"] = 0
		}
		if cp["chunks"] == nil {
			cp["chunks"] = 0
		}
		if cp["citeCount"] == nil {
			cp["citeCount"] = 0
		}
		if str(cp["updatedAt"]) == "" {
			cp["updatedAt"] = time.Now().UTC().Format(time.RFC3339)
		}
		out = append(out, cp)
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
		if str(d["workspaceId"]) == workspaceID && (str(d["status"]) == "published" || str(d["status"]) == "ready") {
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
	ws := s.workspaceID(r)
	now := time.Now().UTC().Format(time.RFC3339)
	convID := s.Store.ID("conv")
	deID := body["digitalEmployeeId"]
	deName := strings.TrimSpace(coalesce(str(body["digitalEmployeeName"]), str(body["agent"])))
	if deName == "" {
		if str(deID) != "" {
			deName = "岗位专家"
		} else {
			deName = "助手"
		}
	}
	title := coalesce(str(body["title"]), "新会话")
	modelID := coalesce(str(body["modelId"]), "sonnet-4")
	item := map[string]any{
		"id": convID, "workspaceId": ws,
		"title": title, "digitalEmployeeId": deID, "modelId": modelID,
		"updatedAt": now,
	}
	sessID := s.Store.ID("sess")
	session := map[string]any{
		"id": sessID, "workspaceId": ws, "ownerId": id.ID, "title": title,
		"preview": "暂无消息", "agent": deName,
		"digitalEmployeeId": deID, "digitalEmployeeName": deName,
		"conversationId": convID, "status": "active", "modelId": modelID,
		"createdAt": now, "updatedAt": now, "lastMessageAt": now,
	}
	s.Store.Lock()
	s.Store.Conversations = append([]map[string]any{item}, s.Store.Conversations...)
	s.Store.Sessions = append([]map[string]any{session}, s.Store.Sessions...)
	if s.Store.Messages[convID] == nil {
		s.Store.Messages[convID] = []map[string]any{}
	}
	s.Store.AppendAudit(ws, id.Name, "创建协作会话", title, "success", "")
	s.Store.Unlock()
	s.Store.Persist("conversations")
	s.Store.Persist("sessions")
	s.Store.Persist("messages")
	item["sessionId"] = sessID
	return item, nil
}

func (s *Server) listMessages(r *http.Request) (any, error) {
	raw := conversationIDFromPath(r.URL.Path)
	if raw == "" {
		return nil, apperr.NotFoundErr(apperr.NotFound, "会话不存在")
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	cid := s.resolveMessageBucketID(ws, raw)
	msgs := s.Store.Messages[cid]
	if msgs == nil {
		msgs = []map[string]any{}
	}
	return msgs, nil
}

func (s *Server) copilotStream(w http.ResponseWriter, r *http.Request) {
	id := identityFrom(r.Context())
	rawID := conversationIDFromPath(r.URL.Path)
	if rawID == "" {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "会话不存在"))
		return
	}
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
	clientMsgID := strings.TrimSpace(str(body["clientMsgId"]))
	ws := s.workspaceID(r)
	deID := coalesce(str(body["digitalEmployeeId"]), "")
	requestedModel := coalesce(str(body["modelId"]), coalesce(str(body["model"]), ""))
	modeHint := coalesce(str(body["modeHint"]), str(body["mode"]))
	reflectHint := coalesce(str(body["reflectHint"]), str(body["feedback"]))
	sessionMode := normalizeSessionMode(str(body["sessionMode"]))
	riskLevel := normalizeRiskLevelSession(str(body["riskLevel"]))
	var enabledTools []string
	if arr, ok := body["enabledTools"].([]any); ok {
		for _, t := range arr {
			if s := str(t); s != "" {
				enabledTools = append(enabledTools, s)
			}
		}
	}
	var attachmentIDs []string
	if arr, ok := body["attachmentIds"].([]any); ok {
		for _, t := range arr {
			if s := str(t); s != "" {
				attachmentIDs = append(attachmentIDs, s)
			}
		}
	}

	if id == nil {
		writeErr(w, apperr.UnauthorizedErr("请先登录"))
		return
	}
	if !s.allowCopilotTurn(ws, id.ID) {
		writeErr(w, apperr.New(apperr.RateLimited, 429, "Copilot 回合过于频繁，请稍后再试"))
		return
	}
	safeIn := applyContentSafety(userMsg)
	if safeIn.Blocked {
		IncCopilotSafetyBlocked()
		writeErr(w, apperr.Forbidden(apperr.AccessWriteForbidden, safeIn.Text))
		return
	}
	userMsg = safeIn.Text

	s.Store.RLock()
	cid := s.resolveMessageBucketID(ws, rawID)
	sess := findSessionForStreamLocked(s.Store.Sessions, ws, rawID, cid)
	if sess != nil {
		if sm := str(sess["sessionMode"]); sm != "" && str(body["sessionMode"]) == "" {
			sessionMode = normalizeSessionMode(sm)
		}
		if rl := str(sess["riskLevel"]); rl != "" && str(body["riskLevel"]) == "" {
			riskLevel = normalizeRiskLevelSession(rl)
		}
		if err := assertSessionWritableLocked(sess); err != nil {
			s.Store.RUnlock()
			writeErr(w, err)
			return
		}
	}
	s.Store.RUnlock()

	if attSum := s.attachmentSummaries(attachmentIDs, cid); attSum != "" {
		userMsg = userMsg + attSum
	}

	if clientMsgID != "" {
		if prev := loadIdempotentReply(cid, clientMsgID); prev != nil {
			flusher, ok := w.(http.Flusher)
			if !ok {
				writeErr(w, apperr.New(apperr.Unknown, 500, "流式不支持"))
				return
			}
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("x-correlation-id", corr)
			writeSSE(w, "done", map[string]any{
				"type": "done", "stage": "idempotent", "correlationId": corr,
				"message": prev, "replay": true,
			})
			flusher.Flush()
			IncCopilotStream(true)
			return
		}
	}

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

	// 2) employee — optional; unbound sessions chat as generic assistant
	emit("stage", "employee", map[string]any{"status": "running"})
	emp, _ := s.resolveActiveEmployee(r, deID)
	empMap, _ := emp.(map[string]any)
	if empMap != nil && empMap["skipped"] == true {
		emit("stage", "employee", map[string]any{"status": "ok", "employee": nil, "skipped": true})
	} else if empMap != nil && empMap["active"] == false {
		// Stale / offline binding must not block LLM turns
		emit("stage", "employee", map[string]any{
			"status": "ok", "employee": nil, "warning": coalesce(str(empMap["reason"]), "数字员工不可用"),
		})
	} else {
		emit("stage", "employee", map[string]any{"status": "ok", "employee": empMap})
	}

	// 模型优先级：显式运行配置 > 数字员工装配模型/路由 > 演示别名
	modelID := resolveCopilotModelID(requestedModel, empMap)

	now := time.Now().UTC().Format(time.RFC3339)
	s.Store.Lock()
	userRec := map[string]any{
		"id": s.Store.ID("msg"), "role": "user", "content": userMsg,
		"createdAt": now, "correlationId": corr,
	}
	if clientMsgID != "" {
		userRec["clientMsgId"] = clientMsgID
	}
	if len(attachmentIDs) > 0 {
		userRec["attachmentIds"] = attachmentIDs
	}
	if safeIn.Redacted {
		userRec["moderated"] = true
		userRec["moderationReasons"] = safeIn.Reasons
	}
	s.Store.Messages[cid] = append(s.Store.Messages[cid], userRec)
	s.touchSessionLocked(ws, rawID, cid, userMsg, now, modelID, deID, id.ID)
	s.Store.Unlock()
	s.Store.Persist("messages")
	s.Store.Persist("sessions")
	s.Store.Persist("conversations")

	// 3a) cross-session memory (not the same as published knowledge)
	emit("stage", "memory", map[string]any{"status": "running"})
	resolvedDE := deID
	if resolvedDE == "" && empMap != nil {
		resolvedDE = str(empMap["id"])
	}
	s.Store.RLock()
	memoryHits := s.retrieveMemoryForTurnLocked(ws, id.ID, resolvedDE, cid, userMsg, id)
	historySnapshot := append([]map[string]any{}, s.Store.Messages[cid]...)
	s.Store.RUnlock()
	emit("stage", "memory", map[string]any{
		"status": "ok", "hitCount": len(memoryHits),
		"provenance": memoryProvenanceMaps(memoryHits),
	})

	// Tool registry: capabilities ∩ enabledTools ∩ boundary ∩ sessionMode
	registry := buildToolRegistry(empMap, enabledTools)
	registry = filterRegistryBySessionMode(registry, sessionMode)
	system := buildCopilotSystemPrompt(empMap, nil, memoryHits)
	if sessionMode == sessionModeInvestigate {
		system += "\n当前会话为研判模式：禁止宣称已执行写操作；技能仅可 action=open/artifacts；需要变更时提示用户切换到受控执行。"
	} else {
		system += "\n当前会话为受控执行模式：写类 skill.run/write 将进入人工审核队列；仅当工具观察为 pending_authorization 时可告知已进入审核；未获批准前不得声称执行成功或已生成文件。needs_instruction 表示尚未真正执行脚本。"
	}

	chatMessages := assembleCopilotChatMessages(historySnapshot)
	if len(chatMessages) == 0 {
		chatMessages = []modelprov.ChatMessage{{Role: "user", Content: userMsg}}
	}

	// 4) Harness：Dynamic route → React / Plan-Exec / Direct → Reflection → stream
	emit("stage", "runtime", map[string]any{
		"status": "running", "modelId": modelID, "mode": "harness",
		"sessionMode": sessionMode, "riskLevel": riskLevel,
		"enabledTools": enabledToolKeys(registry), "historyTurns": len(chatMessages),
	})
	streamCtx, streamCancel := context.WithTimeout(r.Context(), 150*time.Second)
	registerStreamCancel(corr, streamCancel)
	defer func() {
		clearStreamCancel(corr)
		streamCancel()
	}()
	reactOut := s.runHarnessTurn(streamCtx, reactTurnInput{
		Request: r, WorkspaceID: ws, ModelID: modelID, System: system,
		Messages: chatMessages, Registry: registry, UserMessage: userMsg,
		ConversationID: cid, CorrelationID: corr, DigitalEmployee: resolvedDE,
		Viewer: id, Emit: emit, ModeHint: modeHint, ReflectHint: reflectHint,
		SessionMode: sessionMode, RiskLevel: riskLevel,
	})
	if reactOut.Err != nil {
		fallback := ""
		if allowRuntimeStub() {
			fallback = s.runtimeReply(userMsg, modelID, enabledTools)
			if strings.Contains(fallback, "[runtime stub]") {
				fallback = ""
			}
		}
		if fallback == "" {
			emit("error", "runtime", map[string]any{"message": "模型调用失败：" + reactOut.Err.Error()})
			return
		}
		reactOut.Text = fallback
		for _, c := range chunkText(fallback, 24) {
			emit("delta", "runtime", map[string]any{"text": c, "modelId": modelID})
			time.Sleep(8 * time.Millisecond)
		}
		emit("stage", "runtime", map[string]any{"status": "degraded", "modelId": modelID, "warning": reactOut.Err.Error()})
	}
	full := reactOut.Text
	safeOut := applyContentSafety(full)
	if safeOut.Blocked {
		IncCopilotSafetyBlocked()
		full = safeOut.Text
		emit("stage", "safety", map[string]any{"status": "blocked", "reasons": safeOut.Reasons})
	} else if safeOut.Redacted {
		full = safeOut.Text
		emit("stage", "safety", map[string]any{"status": "redacted", "reasons": safeOut.Reasons})
	}
	rt := reactOut.Resolved
	resolvedModelID := coalesce(reactOut.ModelID, modelID)
	modelID = resolvedModelID
	toolCalls := reactOut.ToolCalls
	citations := reactOut.Citations
	if toolCalls == nil {
		toolCalls = []map[string]any{}
	}
	mode := coalesce(reactOut.Mode, modeReact)

	// 5) meter (+ optional model budget hard gate)
	emit("stage", "meter", map[string]any{"status": "running"})
	units := len([]rune(full))
	s.Store.Lock()
	budgetErr := s.checkModelBudgetLocked(ws)
	s.Store.Unlock()
	if budgetErr != nil {
		emit("error", "meter", map[string]any{"message": budgetErr.Error()})
		return
	}
	s.recordUsageWS(ws, "copilot", units, corr)
	emit("stage", "meter", map[string]any{"status": "ok", "units": units})

	assistantMsgID := s.Store.ID("msg")
	assistantMsg := map[string]any{
		"id": assistantMsgID, "role": "assistant", "content": full,
		"createdAt": time.Now().UTC().Format(time.RFC3339), "correlationId": corr,
		"toolCalls": toolCalls,
		"metrics": map[string]any{
			"model": modelID, "provider": coalesce(rt.ProviderID, "de-runtime"),
			"source": coalesce(rt.Source, mode),
			"memoryHits": len(memoryHits), "historyTurns": len(chatMessages),
			"reactSteps": reactOut.Steps, "mode": mode, "reflectRounds": reactOut.ReflectRounds,
			"policyLevel": reactOut.PolicyLevel, "policyId": reactOut.PolicyID,
			"sessionMode": sessionMode, "riskLevel": riskLevel,
		},
	}
	if safeOut.Redacted || safeOut.Blocked {
		assistantMsg["moderated"] = true
		assistantMsg["moderationReasons"] = safeOut.Reasons
	}
	if prov := memoryProvenanceMaps(memoryHits); len(prov) > 0 {
		assistantMsg["memoryProvenance"] = prov
	}
	if len(citations) > 0 {
		assistantMsg["citations"] = citations
	}
	if len(reactOut.Plan.Steps) > 0 {
		planSteps := make([]map[string]any, 0, len(reactOut.Plan.Steps))
		for _, st := range reactOut.Plan.Steps {
			planSteps = append(planSteps, map[string]any{
				"id": st.ID, "title": st.Title, "action": st.Action, "tool": st.Tool,
			})
		}
		assistantMsg["plan"] = map[string]any{"goal": reactOut.Plan.Goal, "steps": planSteps}
	}
	if len(reactOut.Agents) > 0 {
		assistantMsg["agents"] = reactOut.Agents
	}
	s.Store.Lock()
	s.Store.Messages[cid] = append(s.Store.Messages[cid], assistantMsg)
	preview := truncateRunes(full, 80)
	s.touchSessionLocked(ws, rawID, cid, preview, time.Now().UTC().Format(time.RFC3339), modelID, resolvedDE, id.ID)
	s.Store.AppendAudit(ws, id.Name, "协作回合", cid, "success", corr)
	if resolvedDE != "" {
		turnOK := true
		turnDur := 0
		for _, tc := range toolCalls {
			st := strings.ToLower(str(tc["status"]))
			if st == "failed" || st == "denied" || st == "error" {
				turnOK = false
			}
			if d := intFrom(tc["durationMs"]); d > turnDur {
				turnDur = d
			}
		}
		s.recordEmployeeRuntimeLocked(resolvedDE, turnDur, turnOK)
	}
	_, _ = s.ingestRuntimeMemoryLocked(runtimeMemoryInput{
		WorkspaceID: ws, OwnerID: id.ID, OwnerName: id.Name, DigitalEmployeeID: resolvedDE,
		Title: "会话上下文 · " + truncateRunes(userMsg, 40),
		Content: "用户：" + userMsg + "\n助手：" + full,
		SourceType: "conversation", SourceID: cid, CorrelationID: corr,
		Layer: "short_term", Scope: "user", Confidence: 0.85,
	})
	// Phase 4: Self-Evolution candidates + Dream compress (no silent production mutate)
	evolveCreated := s.runPostTurnEvolutionLocked(evolveTurnInput{
		WorkspaceID: ws, OwnerID: id.ID, OwnerName: id.Name, DigitalEmployeeID: resolvedDE,
		ConversationID: cid, CorrelationID: corr, MessageID: assistantMsgID,
		UserMessage: userMsg, AssistantText: full, Mode: mode,
		ReflectRounds: reactOut.ReflectRounds, ToolCalls: toolCalls,
		MemoryHits: memoryHits, Emit: nil,
	})
	s.Store.Unlock()
	s.Store.Persist("messages")
	s.Store.Persist("sessions")
	s.Store.Persist("conversations")
	s.Store.Persist("employees")
	rememberIdempotentReply(cid, clientMsgID, assistantMsg)
	go s.persistEvolve()

	for _, cand := range evolveCreated {
		emit("evolve", "candidate", map[string]any{
			"id": cand["id"], "kind": cand["kind"], "status": cand["status"],
			"title": cand["title"], "summary": cand["summary"],
		})
	}
	emit("done", "done", map[string]any{
		"ok": true, "modelId": modelID, "mode": mode,
		"messageId": assistantMsgID, "sessionMode": sessionMode, "riskLevel": riskLevel,
		"memoryHits": len(memoryHits), "historyTurns": len(chatMessages),
		"memoryProvenance": memoryProvenanceMaps(memoryHits),
		"reactSteps": reactOut.Steps, "toolCount": len(toolCalls),
		"reflectRounds": reactOut.ReflectRounds,
		"policyLevel": reactOut.PolicyLevel, "policyId": reactOut.PolicyID,
		"evolveCandidates": len(evolveCreated),
	})
	streamOK = true
}

func (s *Server) touchSessionLocked(ws, rawID, cid, preview, now, modelID, digitalEmployeeID, ownerID string) {
	for i, sess := range s.Store.Sessions {
		if str(sess["workspaceId"]) != ws {
			continue
		}
		if str(sess["id"]) != rawID && str(sess["conversationId"]) != cid && str(sess["id"]) != cid {
			continue
		}
		sess["preview"] = truncateRunes(preview, 120)
		sess["updatedAt"] = now
		sess["lastMessageAt"] = now
		if modelID != "" {
			sess["modelId"] = modelID
		}
		if digitalEmployeeID != "" && str(sess["digitalEmployeeId"]) == "" {
			sess["digitalEmployeeId"] = digitalEmployeeID
		}
		// Auto-title first real turn when still default.
		if title := str(sess["title"]); title == "" || title == "新会话" {
			if t := deriveSessionTitle(preview); t != "" {
				sess["title"] = t
			}
		}
		s.Store.Sessions[i] = sess
		return
	}
	// Stream reached an orphan conversation (local s_* or missing create) — materialize session row.
	sessID := rawID
	if sessID == "" {
		sessID = cid
	}
	if sessID == "" {
		return
	}
	convID := cid
	if convID == "" {
		convID = sessID
	}
	deID := digitalEmployeeID
	deName := "助手"
	for _, c := range s.Store.Conversations {
		if str(c["id"]) == convID {
			if deID == "" {
				deID = str(c["digitalEmployeeId"])
			}
			break
		}
	}
	if deID != "" {
		for _, emp := range s.Store.Employees {
			if str(emp["id"]) == deID {
				deName = coalesce(str(emp["role"]), coalesce(str(emp["name"]), deName))
				break
			}
		}
	}
	title := deriveSessionTitle(preview)
	if title == "" {
		title = "新会话"
	}
	hasConv := false
	for _, c := range s.Store.Conversations {
		if str(c["id"]) == convID {
			hasConv = true
			c["workspaceId"] = coalesce(str(c["workspaceId"]), ws)
			c["updatedAt"] = now
			if deID != "" && str(c["digitalEmployeeId"]) == "" {
				c["digitalEmployeeId"] = deID
			}
			break
		}
	}
	if !hasConv {
		s.Store.Conversations = append([]map[string]any{{
			"id": convID, "workspaceId": ws, "title": title,
			"digitalEmployeeId": deID, "modelId": modelID, "updatedAt": now,
		}}, s.Store.Conversations...)
	}
	session := map[string]any{
		"id": sessID, "workspaceId": ws, "ownerId": ownerID, "title": title,
		"preview": truncateRunes(preview, 120), "agent": deName,
		"digitalEmployeeId": deID, "digitalEmployeeName": deName,
		"conversationId": convID, "status": "active", "modelId": modelID,
		"createdAt": now, "updatedAt": now, "lastMessageAt": now,
	}
	s.Store.Sessions = append([]map[string]any{session}, s.Store.Sessions...)
}

func deriveSessionTitle(preview string) string {
	preview = strings.TrimSpace(preview)
	if preview == "" {
		return ""
	}
	// Collapse whitespace; take first line / ~24 runes.
	preview = strings.ReplaceAll(preview, "\n", " ")
	runes := []rune(preview)
	if len(runes) > 24 {
		return string(runes[:24]) + "…"
	}
	return preview
}

// removeMemoryForConversationLocked drops short_term memories sourced from a conversation.
// Returns deleted memory ids for durable PersistDelete. Caller must hold Store.Lock.
func (s *Server) removeMemoryForConversationLocked(ws, convID string) []string {
	if convID == "" {
		return nil
	}
	kept := make([]map[string]any, 0, len(s.Store.MemoryRecords))
	var deleted []string
	for _, mem := range s.Store.MemoryRecords {
		if str(mem["sourceId"]) == convID &&
			(str(mem["workspaceId"]) == "" || str(mem["workspaceId"]) == ws) &&
			(str(mem["layer"]) == "" || str(mem["layer"]) == "short_term") {
			if id := str(mem["id"]); id != "" {
				deleted = append(deleted, id)
			}
			continue
		}
		kept = append(kept, mem)
	}
	s.Store.MemoryRecords = kept
	return deleted
}

func allowRuntimeStub() bool {
	v := strings.TrimSpace(os.Getenv("DE_ALLOW_RUNTIME_STUB"))
	return v == "1" || strings.EqualFold(v, "true")
}

// resolveCopilotModelID picks the model/route for one turn.
// Explicit run-config wins unless it is a demo alias while the employee has a bound model/route.
func resolveCopilotModelID(requested string, emp map[string]any) string {
	requested = strings.TrimSpace(requested)
	empModel := employeeBoundModel(emp)
	if isDemoModelAlias(requested) && empModel != "" {
		return empModel
	}
	if requested != "" {
		return requested
	}
	if empModel != "" {
		return empModel
	}
	return ""
}

func employeeBoundModel(emp map[string]any) string {
	if emp == nil || emp["skipped"] == true || emp["active"] == false {
		return ""
	}
	if caps, ok := emp["capabilities"].(map[string]any); ok {
		if m := strings.TrimSpace(coalesce(str(caps["model"]), str(caps["modelId"]))); m != "" {
			return m
		}
	}
	return strings.TrimSpace(coalesce(str(emp["model"]), str(emp["modelId"])))
}

func isDemoModelAlias(id string) bool {
	switch strings.ToLower(strings.TrimSpace(id)) {
	case "", "sonnet-4", "haiku-4.5", "opus-4.8", "gpt-5", "deepseek-r2":
		return true
	default:
		return false
	}
}

func ragSnippetsForPrompt(ragHits any) []string {
	m, ok := ragHits.(map[string]any)
	if !ok {
		return nil
	}
	raw, ok := m["results"].([]map[string]any)
	if !ok {
		// JSON decode often yields []any
		arr, ok := m["results"].([]any)
		if !ok {
			return nil
		}
		var out []string
		for _, item := range arr {
			im, _ := item.(map[string]any)
			if im == nil {
				continue
			}
			sn := coalesce(str(im["snippet"]), str(im["title"]))
			if sn != "" {
				out = append(out, sn)
			}
		}
		return out
	}
	var out []string
	for _, im := range raw {
		sn := coalesce(str(im["snippet"]), str(im["title"]))
		if sn != "" {
			out = append(out, sn)
		}
	}
	return out
}

func (s *Server) runtimeReply(prompt, modelID string, enabledTools []string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	payload, _ := json.Marshal(map[string]any{
		"input": prompt, "model": modelID, "modelId": modelID, "enabledTools": enabledTools,
	})
	resp, err := client.Post(s.RuntimeURL+"/v1/invoke", "application/json", strings.NewReader(string(payload)))
	if err == nil && resp != nil {
		defer resp.Body.Close()
		if resp.StatusCode < 300 {
			b, _ := io.ReadAll(resp.Body)
			var out struct {
				Output   string `json:"output"`
				Provider string `json:"provider"`
			}
			if json.Unmarshal(b, &out) == nil && out.Output != "" {
				if out.Provider == "stub" || strings.Contains(out.Output, "[runtime stub]") {
					if !allowRuntimeStub() {
						return ""
					}
				}
				return out.Output
			}
		}
	}
	if !allowRuntimeStub() {
		return ""
	}
	toolHint := ""
	if len(enabledTools) > 0 {
		toolHint = "；可用工具：" + strings.Join(enabledTools, ",")
	}
	return "（de-core 退化回复 · " + modelID + "）已收到：" + prompt + "。建议结合知识检索与已上岗数字员工能力继续排查" + toolHint + "。"
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
