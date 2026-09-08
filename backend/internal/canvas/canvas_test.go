package canvas_test

import (
	"errors"
	"testing"
	"time"

	"github.com/digital-employee-platform/backend/internal/canvas"
)

func fixedNow() time.Time { return time.Date(2026, 9, 8, 9, 0, 0, 0, time.UTC) }

func newStore(t *testing.T) *canvas.Store {
	t.Helper()
	var counter int
	return canvas.New(fixedNow, func() string {
		counter++
		return counterID(counter)
	})
}

func counterID(n int) string {
	const set = "0123456789abcdef"
	out := []byte{}
	if n == 0 {
		return string(set[0])
	}
	for n > 0 {
		out = append([]byte{set[n%16]}, out...)
		n /= 16
	}
	return string(out)
}

func TestCreateBoardRequiresFields(t *testing.T) {
	s := newStore(t)
	if _, err := s.CreateBoard("", "t", "alice", ""); err == nil {
		t.Fatal("expected error on empty workspace")
	}
	if _, err := s.CreateBoard("w1", "", "alice", ""); err == nil {
		t.Fatal("expected error on empty title")
	}
}

func TestCreateBoardStored(t *testing.T) {
	s := newStore(t)
	b, err := s.CreateBoard("w1", "Plan Q4", "alice", "")
	if err != nil {
		t.Fatal(err)
	}
	if b.ID == "" || b.Title != "Plan Q4" {
		t.Fatalf("unexpected board: %+v", b)
	}
	if got := s.ListBoards("w1"); len(got) != 1 {
		t.Fatalf("want 1 board, got %d", len(got))
	}
}

func TestListBoardsFilteredByWorkspace(t *testing.T) {
	s := newStore(t)
	s.CreateBoard("w1", "A", "a", "")
	s.CreateBoard("w1", "B", "a", "")
	s.CreateBoard("w2", "X", "b", "")
	if got := s.ListBoards("w1"); len(got) != 2 {
		t.Fatalf("want 2, got %d", len(got))
	}
	if got := s.ListBoards("w2"); len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}
}

func TestGetBoardMissing(t *testing.T) {
	s := newStore(t)
	if _, err := s.GetBoard("nope"); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("want ErrBoardNotFound, got %v", err)
	}
}

func TestDeleteBoardCascades(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", "")
	c, _ := s.CreateComment(b.ID, "w1", "alice", "x", 0.1, 0.2)
	if err := s.DeleteBoard(b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetBoard(b.ID); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("expected board gone, got %v", err)
	}
	if got := s.ListComments(b.ID); len(got) != 0 {
		t.Fatalf("expected comments removed, got %d", len(got))
	}
	if got := s.ListComments(c.BoardID); len(got) != 0 {
		t.Fatalf("expected comments removed via list, got %d", len(got))
	}
}

func TestCreateCommentRequiresBoard(t *testing.T) {
	s := newStore(t)
	if _, err := s.CreateComment("nope", "w1", "alice", "hi", 0, 0); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("want ErrBoardNotFound, got %v", err)
	}
}

func TestCreateCommentWorkspaceMismatch(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", "")
	if _, err := s.CreateComment(b.ID, "w-other", "alice", "x", 0.1, 0.2); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("want ErrBoardNotFound, got %v", err)
	}
}

func TestCreateCommentRequiresText(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", "")
	if _, err := s.CreateComment(b.ID, "w1", "alice", "", 0, 0); err == nil {
		t.Fatal("expected error on empty text")
	}
}

func TestCommentCRUD(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", "")
	c, err := s.CreateComment(b.ID, "w1", "alice", "first", 0.1, 0.2)
	if err != nil {
		t.Fatal(err)
	}
	if c.Status != canvas.CommentOpen {
		t.Fatalf("status: %s", c.Status)
	}
	if got := s.ListComments(b.ID); len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}

	updated, err := s.EditComment(c.ID, "alice", canvas.CommentResolved, "first (fixed)")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Status != canvas.CommentResolved {
		t.Fatalf("status: %s", updated.Status)
	}
	if updated.Text != "first (fixed)" {
		t.Fatalf("text: %s", updated.Text)
	}

	if err := s.DeleteComment(c.ID); err != nil {
		t.Fatal(err)
	}
	if got := s.ListComments(b.ID); len(got) != 0 {
		t.Fatalf("want 0, got %d", len(got))
	}
}

func TestEditCommentMissing(t *testing.T) {
	s := newStore(t)
	if _, err := s.EditComment("nope", "a", "", ""); !errors.Is(err, canvas.ErrCommentNotFound) {
		t.Fatalf("want ErrCommentNotFound, got %v", err)
	}
}

func TestPresenceTouchAndSweep(t *testing.T) {
	// Build a store whose clock advances on demand so we can prove
	// sweep evicts stale entries without resorting to time.Sleep.
	now := fixedNow()
	s := canvas.New(func() time.Time { return now }, func() string { return "x" })
	b, _ := s.CreateBoard("w1", "T", "a", "")
	s.TouchPresence(b.ID, "alice")
	s.TouchPresence(b.ID, "bob")
	if got := s.PresenceCount(b.ID); got != 2 {
		t.Fatalf("count: %d", got)
	}
	if got := s.PresenceForBoard(b.ID); len(got) != 2 {
		t.Fatalf("list: %d", len(got))
	}
	// Nothing yet to sweep within the TTL.
	if swept := s.SweepPresence(1 * time.Hour); swept != 0 {
		t.Fatalf("expected nothing swept, got %d", swept)
	}
	// Advance the clock past the TTL and sweep again.
	now = now.Add(2 * time.Hour)
	if swept := s.SweepPresence(1 * time.Hour); swept != 2 {
		t.Fatalf("expected 2 swept, got %d", swept)
	}
	if got := s.PresenceCount(b.ID); got != 0 {
		t.Fatalf("expected 0 after sweep, got %d", got)
	}
}

func TestUniqueID(t *testing.T) {
	s := newStore(t)
	a := s.UniqueIDForTest("b")
	b := s.UniqueIDForTest("b")
	if a == b {
		t.Fatalf("expected unique ids, got %q == %q", a, b)
	}
}
func TestSweepCommentsDisabledWhenTTLZero(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "B", "alice", "")
	c, _ := s.CreateComment(b.ID, "w1", "alice", "test", 0.1, 0.2)
	if _, err := s.EditComment(c.ID, "alice", canvas.CommentResolved, ""); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if swept := s.SweepComments(0); swept != 0 {
		t.Errorf("ttl=0 must disable sweep, got %d", swept)
	}
}

func TestSweepCommentsRemovesResolvedOlderThanTTL(t *testing.T) {
	now := time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC)
	var counter int
	s := canvas.New(func() time.Time { return now }, func() string {
		counter++
		return counterID(counter)
	})
	b, _ := s.CreateBoard("w1", "B", "alice", "")
	c, _ := s.CreateComment(b.ID, "w1", "alice", "test", 0.1, 0.2)
	if _, err := s.EditComment(c.ID, "alice", canvas.CommentResolved, ""); err != nil {
		t.Fatalf("resolve: %v", err)
	}
	// 1h later, ttl=30m → should drop
	now = now.Add(1 * time.Hour)
	if swept := s.SweepComments(30 * time.Minute); swept != 1 {
		t.Errorf("expected 1 swept, got %d", swept)
	}
	comments := s.ListComments(b.ID)
	if len(comments) != 0 {
		t.Errorf("expected comment removed, got %d", len(comments))
	}
}

func TestSweepCommentsKeepsOpen(t *testing.T) {
	now := time.Date(2026, 9, 8, 10, 0, 0, 0, time.UTC)
	var counter int
	s := canvas.New(func() time.Time { return now }, func() string {
		counter++
		return counterID(counter)
	})
	b, _ := s.CreateBoard("w1", "B", "alice", "")
	_, _ = s.CreateComment(b.ID, "w1", "alice", "still open", 0.1, 0.2)
	now = now.Add(1 * time.Hour)
	if swept := s.SweepComments(30 * time.Minute); swept != 0 {
		t.Errorf("open comments must be preserved, got swept=%d", swept)
	}
	if got := len(s.ListComments(b.ID)); got != 1 {
		t.Errorf("open comment missing after sweep, got %d", got)
	}
}

func TestCreateBoardKindDefaultsToComments(t *testing.T) {
	s := newStore(t)
	b, err := s.CreateBoard("w1", "T", "alice", "")
	if err != nil {
		t.Fatal(err)
	}
	if b.Kind != canvas.BoardComments {
		t.Fatalf("default kind: got %s want %s", b.Kind, canvas.BoardComments)
	}
}

func TestCreateBoardKindWorkflow(t *testing.T) {
	s := newStore(t)
	b, err := s.CreateBoard("w1", "DAG", "alice", canvas.BoardWorkflow)
	if err != nil {
		t.Fatal(err)
	}
	if b.Kind != canvas.BoardWorkflow {
		t.Fatalf("kind: got %s want workflow", b.Kind)
	}
}

func TestCreateBoardKindNormalisesUnknown(t *testing.T) {
	s := newStore(t)
	b, err := s.CreateBoard("w1", "T", "alice", canvas.BoardKind("random"))
	if err != nil {
		t.Fatal(err)
	}
	if b.Kind != canvas.BoardComments {
		t.Fatalf("unknown kind must default to comments, got %s", b.Kind)
	}
}

func TestGetWorkflowMissingBoard(t *testing.T) {
	s := newStore(t)
	if _, err := s.GetWorkflow("missing"); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("want ErrBoardNotFound, got %v", err)
	}
}

func TestGetWorkflowEmptyDefaults(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", canvas.BoardWorkflow)
	g, err := s.GetWorkflow(b.ID)
	if err != nil {
		t.Fatal(err)
	}
	if g == nil || len(g.Nodes) != 0 || len(g.Edges) != 0 {
		t.Fatalf("want empty graph, got %+v", g)
	}
}

func TestSetWorkflowReplacesAtomically(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "DAG", "a", canvas.BoardWorkflow)
	first := &canvas.WorkflowGraph{
		Nodes: []canvas.WorkflowNode{
			{ID: "n1", Kind: "start", Label: "Start", X: 0, Y: 0},
			{ID: "n2", Kind: "task", Label: "Task", X: 100, Y: 100},
		},
		Edges: []canvas.WorkflowEdge{{ID: "e1", Source: "n1", Target: "n2"}},
	}
	if _, err := s.SetWorkflow(b.ID, first); err != nil {
		t.Fatal(err)
	}
	second := &canvas.WorkflowGraph{
		Nodes: []canvas.WorkflowNode{{ID: "n3", Kind: "end", Label: "End", X: 200, Y: 0}},
		Edges: []canvas.WorkflowEdge{},
	}
	got, err := s.SetWorkflow(b.ID, second)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Nodes) != 1 || got.Nodes[0].ID != "n3" {
		t.Fatalf("expected single n3 after replace, got %+v", got.Nodes)
	}
	if len(got.Edges) != 0 {
		t.Fatalf("expected no edges after replace, got %+v", got.Edges)
	}
}

func TestSetWorkflowPromotesCommentsBoard(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "T", "a", "") // comments
	if b.Kind != canvas.BoardComments {
		t.Fatalf("setup: want comments, got %s", b.Kind)
	}
	if _, err := s.SetWorkflow(b.ID, &canvas.WorkflowGraph{
		Nodes: []canvas.WorkflowNode{{ID: "n1", Kind: "task", Label: "x", X: 0, Y: 0}},
	}); err != nil {
		t.Fatal(err)
	}
	b2, _ := s.GetBoard(b.ID)
	if b2.Kind != canvas.BoardWorkflow {
		t.Fatalf("kind must promote to workflow on SetWorkflow, got %s", b2.Kind)
	}
}

func TestDeleteBoardClearsWorkflow(t *testing.T) {
	s := newStore(t)
	b, _ := s.CreateBoard("w1", "DAG", "a", canvas.BoardWorkflow)
	if _, err := s.SetWorkflow(b.ID, &canvas.WorkflowGraph{
		Nodes: []canvas.WorkflowNode{{ID: "n1", Kind: "task", Label: "x", X: 0, Y: 0}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteBoard(b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetWorkflow(b.ID); !errors.Is(err, canvas.ErrBoardNotFound) {
		t.Fatalf("want ErrBoardNotFound, got %v", err)
	}
}
