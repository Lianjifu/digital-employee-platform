package server

import (
	"context"
	"net/http"
	"time"

	"connectrpc.com/connect"
	collabv1 "github.com/digital-employee-platform/backend/gen/de/collab/v1"
	"github.com/digital-employee-platform/backend/gen/de/collab/v1/collabv1connect"
	employeev1 "github.com/digital-employee-platform/backend/gen/de/employee/v1"
	"github.com/digital-employee-platform/backend/gen/de/employee/v1/employeev1connect"
	ragv1 "github.com/digital-employee-platform/backend/gen/de/rag/v1"
	"github.com/digital-employee-platform/backend/gen/de/rag/v1/ragv1connect"
	runtimev1 "github.com/digital-employee-platform/backend/gen/de/runtime/v1"
	"github.com/digital-employee-platform/backend/gen/de/runtime/v1/runtimev1connect"
)

// mountConnectRPC registers buf-generated Connect handlers for ModeAll (compat shell).
func (s *Server) mountConnectRPC(mux *http.ServeMux) {
	s.mountConnectRPCForMode(mux, ModeAll)
}

// mountConnectRPCForMode registers Connect handlers owned by this deployment unit.
func (s *Server) mountConnectRPCForMode(mux *http.ServeMux, mode ServiceMode) {
	all := mode == ModeAll
	if all || mode == ModeCap {
		p, h := ragv1connect.NewRagServiceHandler(&ragConnect{s})
		mux.Handle(p, h)
		p, h = runtimev1connect.NewRuntimeServiceHandler(&runtimeConnect{s})
		mux.Handle(p, h)
	}
	if all || mode == ModeCollab {
		p, h := collabv1connect.NewCollabServiceHandler(&collabConnect{s})
		mux.Handle(p, h)
		p, h = employeev1connect.NewEmployeeServiceHandler(&employeeConnect{s})
		mux.Handle(p, h)
	}
}

type ragConnect struct{ s *Server }

func (c *ragConnect) Retrieve(ctx context.Context, req *connect.Request[ragv1.RetrieveRequest]) (*connect.Response[ragv1.RetrieveResponse], error) {
	r := requestFromConnect(ctx, req.Header())
	corr := req.Msg.GetCorrelationId()
	if corr == "" {
		corr = c.s.Store.ID("corr")
	}
	body := map[string]any{"query": req.Msg.GetQuery(), "correlationId": corr}
	raw, err := c.s.retrievePublished(r, body, corr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	out := &ragv1.RetrieveResponse{Query: req.Msg.GetQuery(), CorrelationId: corr, Backend: "published-memory"}
	if m, ok := raw.(map[string]any); ok {
		if b := str(m["backend"]); b != "" {
			out.Backend = b
		}
		if results, ok := m["results"].([]map[string]any); ok {
			for _, hit := range results {
				out.Results = append(out.Results, &ragv1.RetrieveHit{
					DocId: str(hit["docId"]), Title: str(hit["title"]), Snippet: str(hit["snippet"]),
					Score: toFloat(hit["score"]), Status: coalesce(str(hit["status"]), "published"),
				})
			}
		} else if arr, ok := m["results"].([]any); ok {
			for _, x := range arr {
				hit, _ := x.(map[string]any)
				if hit == nil {
					continue
				}
				out.Results = append(out.Results, &ragv1.RetrieveHit{
					DocId: str(hit["docId"]), Title: str(hit["title"]), Snippet: str(hit["snippet"]),
					Score: toFloat(hit["score"]), Status: coalesce(str(hit["status"]), "published"),
				})
			}
		}
	}
	return connect.NewResponse(out), nil
}

func (c *ragConnect) SyncPublished(ctx context.Context, req *connect.Request[ragv1.SyncPublishedRequest]) (*connect.Response[ragv1.SyncPublishedResponse], error) {
	_ = ctx
	n := int32(len(req.Msg.GetDocs()))
	return connect.NewResponse(&ragv1.SyncPublishedResponse{Indexed: n}), nil
}

type collabConnect struct{ s *Server }

func (c *collabConnect) CreateConversation(ctx context.Context, req *connect.Request[collabv1.CreateConversationRequest]) (*connect.Response[collabv1.Conversation], error) {
	r := requestFromConnect(ctx, req.Header())
	id := identityFrom(ctx)
	ws := c.s.workspaceID(r)
	title := req.Msg.GetTitle()
	if title == "" {
		title = "新会话"
	}
	item := &collabv1.Conversation{
		Id: c.s.Store.ID("conv"), WorkspaceId: ws, Title: title,
		DigitalEmployeeId: req.Msg.GetDigitalEmployeeId(),
		UpdatedAt:         time.Now().UTC().Format(time.RFC3339),
	}
	c.s.Store.Lock()
	c.s.Store.Conversations = append([]map[string]any{{
		"id": item.Id, "workspaceId": item.WorkspaceId, "title": item.Title,
		"digitalEmployeeId": item.DigitalEmployeeId, "updatedAt": item.UpdatedAt,
	}}, c.s.Store.Conversations...)
	if id != nil {
		c.s.Store.AppendAudit(ws, id.Name, "创建协作会话", item.Title, "success", "")
	}
	c.s.Store.Unlock()
	c.s.Store.Persist("conversations")
	return connect.NewResponse(item), nil
}

func (c *collabConnect) StreamTurn(ctx context.Context, req *connect.Request[collabv1.StreamTurnRequest], stream *connect.ServerStream[collabv1.StreamTurnEvent]) error {
	corr := req.Msg.GetCorrelationId()
	if corr == "" {
		corr = c.s.Store.ID("corr")
	}
	stages := []string{"policy", "employee", "rag", "runtime", "meter"}
	for _, stage := range stages {
		if err := stream.Send(&collabv1.StreamTurnEvent{
			Type: "stage", Stage: stage, CorrelationId: corr,
			Text: "ok", Meta: map[string]string{"source": "connect"},
		}); err != nil {
			return err
		}
	}
	_ = ctx
	return stream.Send(&collabv1.StreamTurnEvent{
		Type: "done", Text: req.Msg.GetContent(), CorrelationId: corr,
	})
}

type employeeConnect struct{ s *Server }

func (c *employeeConnect) ResolveActive(ctx context.Context, req *connect.Request[employeev1.ResolveActiveRequest]) (*connect.Response[employeev1.ResolveActiveResponse], error) {
	r := requestFromConnect(ctx, req.Header())
	raw, err := c.s.resolveActiveEmployee(r, req.Msg.GetDigitalEmployeeId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	m, _ := raw.(map[string]any)
	out := &employeev1.ResolveActiveResponse{
		Id: str(m["id"]), Name: str(m["name"]), Lifecycle: str(m["lifecycle"]),
		Reason: str(m["reason"]), Active: m["active"] == true,
	}
	return connect.NewResponse(out), nil
}

type runtimeConnect struct{ s *Server }

func (c *runtimeConnect) Invoke(ctx context.Context, req *connect.Request[runtimev1.InvokeRequest]) (*connect.Response[runtimev1.InvokeResponse], error) {
	_ = ctx
	out := c.s.runtimeReply(req.Msg.GetInput(), "sonnet-4", nil)
	corr := req.Msg.GetCorrelationId()
	if corr == "" {
		corr = c.s.Store.ID("corr")
	}
	return connect.NewResponse(&runtimev1.InvokeResponse{
		Output: out, Graph: "minimal", CorrelationId: corr, Tokens: int32(len([]rune(out))),
	}), nil
}

func requestFromConnect(ctx context.Context, h http.Header) *http.Request {
	r, _ := http.NewRequestWithContext(ctx, http.MethodPost, "/", nil)
	r.Header = h.Clone()
	return r
}
