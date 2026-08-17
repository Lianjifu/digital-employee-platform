package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// handleConnect is the legacy Connect-JSON envelope gateway
// ({ok,data}) used by early FE smoke. Prefer buf-generated handlers
// mounted by mountConnectRPC (Protobuf / Connect-JSON codecs).
func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "Connect 仅支持 POST"))
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/connect/")
	// If a formal Connect handler is registered for this procedure, let the
	// ServeMux route win — this function is only reached for the catch-all
	// when path does not match a mounted service prefix. Keep JSON envelope
	// for StreamTurn SSE-shaped clients and unknown methods.
	body, _ := decodeMap(r)
	corr := coalesce(str(body["correlationId"]), coalesce(str(body["correlation_id"]), s.Store.ID("corr")))

	switch path {
	case "de.collab.v1.CollabService/CreateConversation":
		id := identityFrom(r.Context())
		title := coalesce(str(body["title"]), "新会话")
		deID := coalesce(str(body["digitalEmployeeId"]), str(body["digital_employee_id"]))
		item := map[string]any{
			"id": s.Store.ID("conv"), "workspaceId": s.workspaceID(r),
			"title": title, "digitalEmployeeId": deID,
			"updatedAt": time.Now().UTC().Format(time.RFC3339),
		}
		s.Store.Lock()
		s.Store.Conversations = append([]map[string]any{item}, s.Store.Conversations...)
		if id != nil {
			s.Store.AppendAudit(s.workspaceID(r), id.Name, "创建协作会话", title, "success", corr)
		}
		s.Store.Unlock()
		writeConnect(w, item, nil)
	case "de.collab.v1.CollabService/StreamTurn":
		cid := coalesce(str(body["conversationId"]), str(body["conversation_id"]))
		if cid == "" {
			writeErr(w, apperr.BadReq(apperr.BadRequest, "缺少 conversation_id"))
			return
		}
		payload, _ := json.Marshal(map[string]any{
			"content":           coalesce(str(body["content"]), str(body["message"])),
			"digitalEmployeeId": coalesce(str(body["digitalEmployeeId"]), str(body["digital_employee_id"])),
			"correlationId":     corr,
		})
		r.Body = ioNopCloser(strings.NewReader(string(payload)))
		r.URL.Path = "/api/copilot/conversations/" + cid + "/stream"
		r.Header.Set("x-correlation-id", corr)
		s.copilotStream(w, r)
	case "de.rag.v1.RagService/Retrieve":
		data, err := s.retrievePublished(r, body, corr)
		writeConnect(w, data, err)
	case "de.runtime.v1.RuntimeService/Invoke":
		out := s.runtimeReply(coalesce(str(body["input"]), str(body["prompt"])), coalesce(str(body["modelId"]), coalesce(str(body["model"]), "sonnet-4")), nil)
		writeConnect(w, map[string]any{
			"output": out, "graph": "minimal", "correlationId": corr, "tokens": len([]rune(out)),
		}, nil)
	case "de.employee.v1.EmployeeService/ResolveActive":
		data, err := s.resolveActiveEmployee(r, coalesce(str(body["digitalEmployeeId"]), str(body["digital_employee_id"])))
		writeConnect(w, data, err)
	default:
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "未知 Connect 方法: "+path))
	}
}

func writeConnect(w http.ResponseWriter, data any, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
}

func (s *Server) resolveActiveEmployee(r *http.Request, deID string) (any, error) {
	deID = strings.TrimSpace(deID)
	if deID == "" {
		return map[string]any{"active": true, "skipped": true}, nil
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	for _, e := range s.Store.Employees {
		if str(e["id"]) != deID {
			continue
		}
		if str(e["workspaceId"]) != ws {
			continue
		}
		life := str(e["lifecycle"])
		active := life == "active" || life == "published"
		reason := ""
		if !active {
			reason = "数字工作伙伴未上岗: " + life
		}
		return map[string]any{
			"id": e["id"], "name": e["name"], "role": e["role"], "department": e["department"],
			"description": e["description"], "responsibilities": e["responsibilities"],
			"prohibitedActions": e["prohibitedActions"], "capabilities": e["capabilities"],
			"boundaryPolicy": e["boundaryPolicy"],
			"lifecycle": life, "active": active, "reason": reason,
		}, nil
	}
	return map[string]any{"id": deID, "active": false, "reason": "未找到数字工作伙伴"}, nil
}

func (s *Server) retrievePublished(r *http.Request, body map[string]any, corr string) (any, error) {
	query := str(body["query"])
	ws := s.workspaceID(r)
	if hits := s.callRAGPublished(query, ws, corr); hits != nil {
		s.recordUsageWS(ws, "rag", 1, corr)
		return hits, nil
	}
	s.Store.RLock()
	var results []map[string]any
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["workspaceId"]) != ws {
			continue
		}
		if str(d["status"]) != "published" {
			continue
		}
		if query == "" || strings.Contains(str(d["title"]), query) {
			results = append(results, map[string]any{
				"docId": d["id"], "title": d["title"], "score": 0.8,
				"snippet": "已发布知识命中：" + str(d["title"]), "status": "published",
			})
		}
	}
	s.Store.RUnlock()
	s.recordUsageWS(ws, "rag", 1, corr)
	return map[string]any{"query": query, "results": results, "backend": "published-memory", "correlationId": corr}, nil
}

func (s *Server) callRAGPublished(query, workspaceID, corr string) any {
	client := &http.Client{Timeout: 2 * time.Second}
	s.Store.RLock()
	var docs []map[string]any
	allowed := map[string]struct{}{}
	for _, d := range s.Store.KnowledgeDocs {
		if str(d["workspaceId"]) == workspaceID && str(d["status"]) == "published" {
			id := str(d["id"])
			allowed[id] = struct{}{}
			docs = append(docs, map[string]any{
				"docId": id, "title": d["title"],
				"snippet": "已发布：" + str(d["title"]), "score": 0.9, "status": "published",
			})
		}
	}
	s.Store.RUnlock()
	// No published corpus → skip sidecar (avoids RAG global INDEX leaking non-published seeds).
	if len(docs) == 0 {
		return nil
	}
	payload, _ := json.Marshal(map[string]any{
		"query": query, "workspaceId": workspaceID, "correlationId": corr,
		"publishedOnly": true, "docs": docs,
	})
	resp, err := client.Post(s.RAGURL+"/v1/retrieve", "application/json", strings.NewReader(string(payload)))
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil
	}
	var out map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil
	}
	// Defense in depth: drop any hit outside the published corpus we authorized.
	if raw, ok := out["results"]; ok {
		filtered := make([]any, 0)
		for _, item := range knowledgeSliceMaps(raw) {
			id := coalesce(str(item["docId"]), str(item["id"]))
			if _, ok := allowed[id]; !ok {
				continue
			}
			filtered = append(filtered, item)
		}
		out["results"] = filtered
	}
	out["correlationId"] = corr
	return out
}

type nopCloser struct{ *strings.Reader }

func (nopCloser) Close() error { return nil }

func ioNopCloser(r *strings.Reader) *nopCloser { return &nopCloser{Reader: r} }
