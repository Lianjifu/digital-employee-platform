// Package canvas is the collaboration backend for canvas boards. It
// owns board metadata, comments, and per-board presence, and exposes
// the same SSE fan-out pattern used by internal/heartbeat so the FE
// can subscribe to a board's event stream.
//
// The package is intentionally framework-free: no Yjs, no external
// CRDT library. Comments are append-mostly and conflict-free by
// construction (each comment carries its own server-stamped ID +
// createdAt). Boards and comments live in the package's own Store
// (thread-safe maps) and are mirrored into the Server's
// KnowledgeExtra["canvas_*"] slice for snapshot persistence.
//
// Event types fanned out on /api/canvas/boards/{id}/stream:
//   - "snapshot" — full board payload on connect
//   - "presence" — workspace members currently viewing the board
//   - "comment" — a comment was created / edited / resolved / deleted
//   - "ping"     — keep-alive
package canvas

import (
	"errors"
	"sort"
	"sync"
	"time"
)

// Errors.
var (
	ErrBoardNotFound   = errors.New("canvas: board not found")
	ErrCommentNotFound = errors.New("canvas: comment not found")
)

// CommentStatus is the lifecycle verb of a comment.
type CommentStatus string

const (
	CommentOpen     CommentStatus = "open"
	CommentResolved CommentStatus = "resolved"
)

// BoardKind is the discriminator for boards. "comments" boards are
// the original comment-pin surface; "workflow" boards carry a node
// /edge DAG and use the same storage and presence plumbing.
type BoardKind string

const (
	BoardComments BoardKind = "comments"
	BoardWorkflow BoardKind = "workflow"
)

// WorkflowNode is one node on a workflow board. X/Y are the absolute
// canvas coordinates (not normalised — workflow DAGs live in an
// unbounded plane).
type WorkflowNode struct {
	ID    string         `json:"id"`
	Kind  string         `json:"kind"` // "start" | "task" | "decision" | "end"
	Label string         `json:"label"`
	X     float64        `json:"x"`
	Y     float64        `json:"y"`
	Meta  map[string]any `json:"meta,omitempty"`
}

// WorkflowEdge is one directed edge on a workflow board. Condition
// is reserved for decision-node branches ("true" / "false") and
// optional everywhere else.
type WorkflowEdge struct {
	ID        string `json:"id"`
	Source    string `json:"source"`
	Target    string `json:"target"`
	Label     string `json:"label,omitempty"`
	Condition string `json:"condition,omitempty"`
}

// WorkflowGraph is the persisted payload for a workflow board.
type WorkflowGraph struct {
	Nodes []WorkflowNode `json:"nodes"`
	Edges []WorkflowEdge `json:"edges"`
}

// Board is one collaboration surface.
type Board struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	Title       string    `json:"title"`
	Owner       string    `json:"owner"`
	Kind        BoardKind `json:"kind"`
	CreatedAt   string    `json:"createdAt"`
	UpdatedAt   string    `json:"updatedAt"`
}

// Comment is one annotation on a Board. X/Y are normalised
// 0..1 coordinates so the FE can render the comment regardless of
// canvas resolution.
type Comment struct {
	ID        string        `json:"id"`
	BoardID   string        `json:"boardId"`
	WorkspaceID string      `json:"workspaceId"`
	X         float64       `json:"x"`
	Y         float64       `json:"y"`
	Text      string        `json:"text"`
	Author    string        `json:"author"`
	Status    CommentStatus `json:"status"`
	CreatedAt string        `json:"createdAt"`
	UpdatedAt string        `json:"updatedAt"`
}

// Presence records who is currently viewing a board.
type Presence struct {
	BoardID   string
	Identity  string
	LastTouch time.Time
}

// EventType is the SSE event verb.
type EventType string

const (
	EventSnapshot EventType = "snapshot"
	EventPresence EventType = "presence"
	EventComment  EventType = "comment"
	EventPing     EventType = "ping"
)

// Event is one payload emitted on a board's stream.
type Event struct {
	Type    EventType `json:"type"`
	BoardID string    `json:"boardId"`
	Payload any       `json:"payload"`
}

// Store is the canvas state. Goroutine-safe.
type Store struct {
	mu       sync.RWMutex
	boards   map[string]*Board
	workflow map[string]*WorkflowGraph
	comments map[string]*Comment
	// boardKey is "<boardID>|<identity>" → LastTouch.
	presence map[string]time.Time
	now      func() time.Time
	idGen    func() string
	// idSet keeps generated IDs unique per process without callers
	// having to thread their own ID generator through every method.
	idSet map[string]struct{}
}

// New returns a Store. now is injectable for tests; idGen should
// produce unique strings. A nil idGen falls back to a
// monotonically-increasing counter (good enough for tests, not for
// production — production wires this to store.ID).
func New(now func() time.Time, idGen func() string) *Store {
	if now == nil {
		now = time.Now
	}
	if idGen == nil {
		var counter uint64
		idGen = func() string {
			counter++
			return counterID(counter)
		}
	}
	return &Store{
		boards:   map[string]*Board{},
		workflow: map[string]*WorkflowGraph{},
		comments: map[string]*Comment{},
		presence: map[string]time.Time{},
		now:      now,
		idGen:    idGen,
		idSet:    map[string]struct{}{},
	}
}

// normaliseBoardKind accepts arbitrary strings and returns a known
// BoardKind, defaulting to BoardComments. Used to tolerate "comments"
// / "workflow" verbatim or empty input from clients.
func normaliseBoardKind(k BoardKind) BoardKind {
	switch k {
	case BoardComments, BoardWorkflow:
		return k
	}
	return BoardComments
}

// CreateBoard inserts a new board and returns it. kind defaults to
// BoardComments when empty or unknown.
func (s *Store) CreateBoard(workspaceID, title, owner string, kind BoardKind) (*Board, error) {
	if workspaceID == "" {
		return nil, errors.New("canvas: workspaceID required")
	}
	if title == "" {
		return nil, errors.New("canvas: title required")
	}
	stamp := s.now().UTC().Format(time.RFC3339)
	b := &Board{
		ID:          s.uniqueID("board"),
		WorkspaceID: workspaceID,
		Title:       title,
		Owner:       owner,
		Kind:        normaliseBoardKind(kind),
		CreatedAt:   stamp,
		UpdatedAt:   stamp,
	}
	s.mu.Lock()
	s.boards[b.ID] = b
	s.mu.Unlock()
	return b, nil
}

// SetKind changes the board kind. Mostly useful for tests; in
// production the kind is set at create time.
func (s *Store) SetKind(id string, kind BoardKind) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.boards[id]
	if !ok {
		return ErrBoardNotFound
	}
	b.Kind = normaliseBoardKind(kind)
	return nil
}

// ListBoards returns the boards for a workspace, sorted by CreatedAt
// descending.
func (s *Store) ListBoards(workspaceID string) []*Board {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Board, 0)
	for _, b := range s.boards {
		if b.WorkspaceID == workspaceID {
			out = append(out, b)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out
}

// GetBoard fetches a board by ID.
func (s *Store) GetBoard(id string) (*Board, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.boards[id]
	if !ok {
		return nil, ErrBoardNotFound
	}
	return b, nil
}

// DeleteBoard removes the board and all its comments.
func (s *Store) DeleteBoard(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.boards[id]; !ok {
		return ErrBoardNotFound
	}
	delete(s.boards, id)
	delete(s.workflow, id)
	for cid, c := range s.comments {
		if c.BoardID == id {
			delete(s.comments, cid)
		}
	}
	for k := range s.presence {
		if startsWithBoardID(k, id) {
			delete(s.presence, k)
		}
	}
	return nil
}

// GetWorkflow returns the workflow graph for a board. Boards that
// don't carry a workflow yet get an empty graph back rather than
// nil so callers can serialise straight to JSON.
func (s *Store) GetWorkflow(boardID string) (*WorkflowGraph, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if _, ok := s.boards[boardID]; !ok {
		return nil, ErrBoardNotFound
	}
	if g, ok := s.workflow[boardID]; ok && g != nil {
		return g, nil
	}
	return &WorkflowGraph{Nodes: []WorkflowNode{}, Edges: []WorkflowEdge{}}, nil
}

// SetWorkflow replaces the workflow graph for a board atomically.
// Empty inputs are tolerated — they clear the board.
func (s *Store) SetWorkflow(boardID string, g *WorkflowGraph) (*WorkflowGraph, error) {
	if g == nil {
		g = &WorkflowGraph{Nodes: []WorkflowNode{}, Edges: []WorkflowEdge{}}
	}
	if g.Nodes == nil {
		g.Nodes = []WorkflowNode{}
	}
	if g.Edges == nil {
		g.Edges = []WorkflowEdge{}
	}
	stamp := s.now().UTC().Format(time.RFC3339)
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.boards[boardID]
	if !ok {
		return nil, ErrBoardNotFound
	}
	cp := WorkflowGraph{Nodes: append([]WorkflowNode(nil), g.Nodes...), Edges: append([]WorkflowEdge(nil), g.Edges...)}
	s.workflow[boardID] = &cp
	b.UpdatedAt = stamp
	if b.Kind != BoardWorkflow {
		b.Kind = BoardWorkflow
	}
	return &cp, nil
}

// CreateComment appends a comment to a board. Returns ErrBoardNotFound
// if the board doesn't exist.
func (s *Store) CreateComment(boardID, workspaceID, author, text string, x, y float64) (*Comment, error) {
	s.mu.RLock()
	b, ok := s.boards[boardID]
	s.mu.RUnlock()
	if !ok {
		return nil, ErrBoardNotFound
	}
	if b.WorkspaceID != workspaceID {
		return nil, ErrBoardNotFound
	}
	if text == "" {
		return nil, errors.New("canvas: comment text required")
	}
	stamp := s.now().UTC().Format(time.RFC3339)
	c := &Comment{
		ID:          s.uniqueID("cmt"),
		BoardID:     boardID,
		WorkspaceID: workspaceID,
		X:           x,
		Y:           y,
		Text:        text,
		Author:      author,
		Status:      CommentOpen,
		CreatedAt:   stamp,
		UpdatedAt:   stamp,
	}
	s.mu.Lock()
	s.comments[c.ID] = c
	b.UpdatedAt = stamp
	s.mu.Unlock()
	return c, nil
}

// EditComment updates the text or status of an existing comment.
func (s *Store) EditComment(id, actor string, status CommentStatus, text string) (*Comment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.comments[id]
	if !ok {
		return nil, ErrCommentNotFound
	}
	if status != "" {
		c.Status = status
	}
	if text != "" {
		c.Text = text
	}
	c.UpdatedAt = s.now().UTC().Format(time.RFC3339)
	if b := s.boards[c.BoardID]; b != nil {
		b.UpdatedAt = c.UpdatedAt
	}
	_ = actor
	return c, nil
}

// DeleteComment removes a comment.
func (s *Store) DeleteComment(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.comments[id]; !ok {
		return ErrCommentNotFound
	}
	delete(s.comments, id)
	return nil
}

// ListComments returns all comments on a board, sorted by CreatedAt.
func (s *Store) ListComments(boardID string) []*Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Comment, 0)
	for _, c := range s.comments {
		if c.BoardID == boardID {
			out = append(out, c)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	return out
}

// TouchPresence records that an identity is currently viewing a board.
func (s *Store) TouchPresence(boardID, identity string) {
	if boardID == "" || identity == "" {
		return
	}
	s.mu.Lock()
	s.presence[presenceKey(boardID, identity)] = s.now().UTC()
	s.mu.Unlock()
}

// SweepPresence removes entries older than ttl.
func (s *Store) SweepPresence(ttl time.Duration) int {
	cutoff := s.now().Add(-ttl)
	s.mu.Lock()
	defer s.mu.Unlock()
	dropped := 0
	for k, t := range s.presence {
		if t.Before(cutoff) {
			delete(s.presence, k)
			dropped++
		}
	}
	return dropped
}

// SweepComments removes resolved comments older than ttl. Returns the
// number of comments deleted. ttl == 0 disables sweeping entirely.
func (s *Store) SweepComments(ttl time.Duration) int {
	if ttl <= 0 {
		return 0
	}
	cutoff := s.now().Add(-ttl)
	s.mu.Lock()
	defer s.mu.Unlock()
	dropped := 0
	for cid, c := range s.comments {
		if c == nil || c.Status != "resolved" {
			continue
		}
		ts, err := time.Parse(time.RFC3339, c.UpdatedAt)
		if err != nil || !ts.After(cutoff) {
			delete(s.comments, cid)
			dropped++
		}
	}
	return dropped
}

// PresenceForBoard returns the identities currently on a board, sorted
// for stable output.
func (s *Store) PresenceForBoard(boardID string) []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []string{}
	for k := range s.presence {
		bid, id, ok := splitPresenceKey(k)
		if !ok || bid != boardID {
			continue
		}
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// PresenceCount returns the number of identities currently on a board.
func (s *Store) PresenceCount(boardID string) int {
	return len(s.PresenceForBoard(boardID))
}

// Broadcaster fans board-scoped Events to per-board subscribers using
// the same drop-on-slow-consumer pattern as internal/heartbeat. It is
// kept separate from the data Store so the data layer remains pure.
type Broadcaster struct {
	mu     sync.Mutex
	bufSize int
	subs   map[string]map[chan Event]struct{} // boardID → set of channels
}

func NewBroadcaster(bufferPerSub int) *Broadcaster {
	if bufferPerSub <= 0 {
		bufferPerSub = 16
	}
	return &Broadcaster{bufSize: bufferPerSub, subs: map[string]map[chan Event]struct{}{}}
}

// Subscribe returns a channel that will receive all events for the
// given board plus the cancel func to release resources.
func (b *Broadcaster) Subscribe(boardID string) (<-chan Event, func()) {
	if b == nil {
		ch := make(chan Event)
		close(ch)
		return ch, func() {}
	}
	ch := make(chan Event, b.bufSize)
	b.mu.Lock()
	if _, ok := b.subs[boardID]; !ok {
		b.subs[boardID] = map[chan Event]struct{}{}
	}
	b.subs[boardID][ch] = struct{}{}
	b.mu.Unlock()
	cancel := func() {
		b.mu.Lock()
		if set, ok := b.subs[boardID]; ok {
			delete(set, ch)
			if len(set) == 0 {
				delete(b.subs, boardID)
			}
		}
		b.mu.Unlock()
		close(ch)
	}
	return ch, cancel
}

// Publish fans an event to every subscriber for that board. Slow
// consumers drop the event; the next emit will overwrite their view.
func (b *Broadcaster) Publish(boardID string, ev Event) {
	if b == nil {
		return
	}
	b.mu.Lock()
	set := b.subs[boardID]
	chans := make([]chan Event, 0, len(set))
	for ch := range set {
		chans = append(chans, ch)
	}
	b.mu.Unlock()
	for _, ch := range chans {
		select {
		case ch <- ev:
		default:
		}
	}
}

// SubscriberCount returns how many clients are listening on a board.
// Used by /metrics for `de_canvas_clients_online{workspace}`.
func (b *Broadcaster) SubscriberCount(boardID string) int {
	if b == nil {
		return 0
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs[boardID])
}

func presenceKey(boardID, identity string) string { return boardID + "|" + identity }
func splitPresenceKey(k string) (string, string, bool) {
	for i := 0; i < len(k); i++ {
		if k[i] == '|' {
			return k[:i], k[i+1:], true
		}
	}
	return "", "", false
}
func startsWithBoardID(k, id string) bool {
	if len(k) < len(id)+1 {
		return false
	}
	return k[:len(id)] == id && k[len(id)] == '|'
}

func (s *Store) uniqueID(prefix string) string {
	return s.UniqueIDForTest(prefix)
}

// UniqueIDForTest returns a unique ID. Exposed (capitalised) so test
// code can verify uniqueness guarantees without poking internals.
func (s *Store) UniqueIDForTest(prefix string) string {
	for i := 0; i < 1000; i++ {
		candidate := prefix + "-" + s.idGen()
		s.mu.Lock()
		if _, exists := s.idSet[candidate]; !exists {
			s.idSet[candidate] = struct{}{}
			s.mu.Unlock()
			return candidate
		}
		s.mu.Unlock()
	}
	return prefix + "-" + s.idGen()
}

func counterID(n uint64) string {
	const digits = "0123456789abcdefghijklmnopqrstuvwxyz"
	if n == 0 {
		return string(digits[0])
	}
	out := []byte{}
	for n > 0 {
		out = append([]byte{digits[n%36]}, out...)
		n /= 36
	}
	return string(out)
}