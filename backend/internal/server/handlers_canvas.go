package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/canvas"
	"github.com/digital-employee-platform/backend/internal/metrics"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
	"github.com/digital-employee-platform/backend/pkg/response"
)

const canvasPresenceTTL = 90 * time.Second

func (s *Server) initCanvas() {
	idGen := s.Store.ID
	s.Canvas = canvas.New(time.Now, func() string { return idGen("cv") })
	s.CanvasBroadcaster = canvas.NewBroadcaster(16)
	go s.canvasJanitor()
}

// canvasJanitor sweeps stale presence every minute.
func (s *Server) canvasJanitor() {
	if s.Canvas == nil {
		return
	}
	for {
		time.Sleep(60 * time.Second)
		s.Canvas.SweepPresence(canvasPresenceTTL)
	}
}

func (s *Server) canvasCreateBoardHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.write") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.write 权限"))
		return
	}
	body, _ := decodeMap(r)
	title := strings.TrimSpace(str(body["title"]))
	if title == "" {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "title 必填"))
		return
	}
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	b, err := s.Canvas.CreateBoard(ws, title, id.Name)
	if err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "创建失败: "+err.Error()))
		return
	}
	s.appendKnowledgeAuditLocked(ws, id.Name, "创建画布", b.ID, "success", "")
	go s.persistCanvas()
	response.OK(w, b)
}

func (s *Server) canvasListBoardsHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.read") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.read 权限"))
		return
	}
	ws := s.workspaceID(r)
	out := s.Canvas.ListBoards(ws)
	response.OK(w, map[string]any{"boards": out})
}

func (s *Server) canvasBoardDetailHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.read") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.read 权限"))
		return
	}
	bid := pathTail(r.URL.Path, "/api/canvas/boards/")
	if i := strings.Index(bid, "/"); i >= 0 {
		bid = bid[:i]
	}
	ws := s.workspaceID(r)
	b, err := s.Canvas.GetBoard(bid)
	if err != nil {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "画布不存在"))
		return
	}
	if b.WorkspaceID != ws {
		writeErr(w, apperr.Forbidden(apperr.WorkspaceScope, "画布不在当前工作区"))
		return
	}
	out := map[string]any{
		"board":    b,
		"comments": s.Canvas.ListComments(b.ID),
		"presence": s.Canvas.PresenceForBoard(b.ID),
	}
	response.OK(w, out)
}

func (s *Server) canvasDeleteBoardHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.write") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.write 权限"))
		return
	}
	bid := pathTail(r.URL.Path, "/api/canvas/boards/")
	ws := s.workspaceID(r)
	b, err := s.Canvas.GetBoard(bid)
	if err != nil {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "画布不存在"))
		return
	}
	if b.WorkspaceID != ws {
		writeErr(w, apperr.Forbidden(apperr.WorkspaceScope, "画布不在当前工作区"))
		return
	}
	if err := s.Canvas.DeleteBoard(bid); err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "删除失败: "+err.Error()))
		return
	}
	if s.CanvasBroadcaster != nil {
		s.CanvasBroadcaster.Publish(bid, canvas.Event{Type: canvas.EventComment, BoardID: bid, Payload: map[string]any{"deleted": true}})
	}
	s.appendKnowledgeAuditLocked(ws, identityFrom(r.Context()).Name, "删除画布", bid, "success", "")
	go s.persistCanvas()
	response.OK(w, map[string]any{"deleted": true})
}

func (s *Server) canvasCreateCommentHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "canvas.comment") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 canvas.comment 权限"))
		return
	}
	bid := pathTail(r.URL.Path, "/api/canvas/boards/")
	if i := strings.Index(bid, "/comments"); i >= 0 {
		bid = bid[:i]
	}
	id := identityFrom(r.Context())
	ws := s.workspaceID(r)
	body, _ := decodeMap(r)
	text := strings.TrimSpace(str(body["text"]))
	x := toFloat(body["x"])
	y := toFloat(body["y"])
	c, err := s.Canvas.CreateComment(bid, ws, id.Name, text, x, y)
	if err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "评论失败: "+err.Error()))
		return
	}
	s.appendKnowledgeAuditLocked(ws, id.Name, "画布评论", c.ID, "success", "")
	metrics.Global.Canvas.Inc("created")
	if s.CanvasBroadcaster != nil {
		s.CanvasBroadcaster.Publish(bid, canvas.Event{Type: canvas.EventComment, BoardID: bid, Payload: c})
	}
	go s.persistCanvas()
	response.OK(w, c)
}

func (s *Server) canvasEditCommentHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "canvas.comment") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 canvas.comment 权限"))
		return
	}
	cid := pathTail(r.URL.Path, "/api/canvas/comments/")
	id := identityFrom(r.Context())
	body, _ := decodeMap(r)
	status := canvas.CommentStatus(strings.TrimSpace(str(body["status"])))
	text := strings.TrimSpace(str(body["text"]))
	c, err := s.Canvas.EditComment(cid, id.Name, status, text)
	if err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "编辑失败: "+err.Error()))
		return
	}
	metrics.Global.Canvas.Inc(actionForStatus(status))
	if s.CanvasBroadcaster != nil {
		s.CanvasBroadcaster.Publish(c.BoardID, canvas.Event{Type: canvas.EventComment, BoardID: c.BoardID, Payload: c})
	}
	go s.persistCanvas()
	response.OK(w, c)
}

func (s *Server) canvasDeleteCommentHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "canvas.comment") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 canvas.comment 权限"))
		return
	}
	cid := pathTail(r.URL.Path, "/api/canvas/comments/")
	if err := s.Canvas.DeleteComment(cid); err != nil {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "删除失败: "+err.Error()))
		return
	}
	metrics.Global.Canvas.Inc("deleted")
	if s.CanvasBroadcaster != nil {
		s.CanvasBroadcaster.Publish("", canvas.Event{Type: canvas.EventComment, BoardID: "", Payload: map[string]any{"deletedId": cid}})
	}
	go s.persistCanvas()
	response.OK(w, map[string]any{"deleted": true})
}

func (s *Server) canvasTouchPresenceHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.read") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.read 权限"))
		return
	}
	bid := pathTail(r.URL.Path, "/api/canvas/boards/")
	if i := strings.Index(bid, "/presence"); i >= 0 {
		bid = bid[:i]
	}
	id := identityFrom(r.Context())
	s.Canvas.TouchPresence(bid, id.Name)
	if s.CanvasBroadcaster != nil {
		s.CanvasBroadcaster.Publish(bid, canvas.Event{
			Type: canvas.EventPresence, BoardID: bid,
			Payload: s.Canvas.PresenceForBoard(bid),
		})
	}
	response.OK(w, map[string]any{"present": s.Canvas.PresenceForBoard(bid)})
}

// canvasStreamHandler streams board events to the FE over SSE. Format
// mirrors /api/online/stream: `event: <type>\ndata: <json>\n\n`.
func (s *Server) canvasStreamHandler(w http.ResponseWriter, r *http.Request) {
	if !auth.Has(identityFrom(r.Context()), "access.read") {
		writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "需要 access.read 权限"))
		return
	}
	bid := pathTail(r.URL.Path, "/api/canvas/boards/")
	if i := strings.Index(bid, "/stream"); i >= 0 {
		bid = bid[:i]
	}
	b, err := s.Canvas.GetBoard(bid)
	if err != nil {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "画布不存在"))
		return
	}
	ws := s.workspaceID(r)
	if b.WorkspaceID != ws {
		writeErr(w, apperr.Forbidden(apperr.WorkspaceScope, "画布不在当前工作区"))
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, apperr.Unavailable(apperr.Unknown, "streaming 不可用"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(200)

	writeSSE := func(t string, payload any) {
		data, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", t, string(data))
	}

	// Initial snapshot.
	writeSSE("snapshot", map[string]any{
		"board":    b,
		"comments": s.Canvas.ListComments(b.ID),
		"presence": s.Canvas.PresenceForBoard(b.ID),
	})
	flusher.Flush()

	ch, cancel := s.CanvasBroadcaster.Subscribe(bid)
	defer cancel()

	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			writeSSE(string(ev.Type), ev.Payload)
			flusher.Flush()
		case <-tick.C:
			writeSSE("tick", map[string]any{
				"presence": s.Canvas.PresenceForBoard(bid),
				"now":      time.Now().UTC().Format(time.RFC3339),
			})
			flusher.Flush()
		}
	}
}

// pathTail returns the substring after prefix. Helper duplicated from
// handlers_knowledge.go to avoid a circular import.
func pathTail(path, prefix string) string {
	return strings.TrimPrefix(strings.TrimPrefix(path, prefix), "/")
}

func actionForStatus(st canvas.CommentStatus) string {
	if st == canvas.CommentResolved {
		return "resolved"
	}
	return "edited"
}

func (s *Server) persistCanvas() {
	s.Store.Lock()
	defer s.Store.Unlock()
	boards := []*canvas.Board{}
	for _, b := range s.Canvas.ListBoards("") {
		bs := b
		boards = append(boards, bs)
	}
	out := make([]map[string]any, 0, len(boards))
	for _, b := range boards {
		out = append(out, map[string]any{
			"id": b.ID, "workspaceId": b.WorkspaceID, "title": b.Title,
			"owner": b.Owner, "createdAt": b.CreatedAt, "updatedAt": b.UpdatedAt,
		})
	}
	s.Store.KnowledgeExtra["canvas_boards"] = out
	cmts := []map[string]any{}
	for _, b := range boards {
		for _, c := range s.Canvas.ListComments(b.ID) {
			cmts = append(cmts, map[string]any{
				"id": c.ID, "boardId": c.BoardID, "workspaceId": c.WorkspaceID,
				"x": c.X, "y": c.Y, "text": c.Text, "author": c.Author,
				"status": c.Status, "createdAt": c.CreatedAt, "updatedAt": c.UpdatedAt,
			})
		}
	}
	s.Store.KnowledgeExtra["canvas_comments"] = cmts
}