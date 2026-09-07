package citationlog

import (
	"errors"
	"testing"
	"time"
)

func TestAppendAssignsID(t *testing.T) {
	l := NewLog()
	id := l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	if id == "" {
		t.Fatal("expected non-empty id")
	}
}

func TestActiveByDocCountsOnlyActive(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t2"})
	l.Append(Record{WorkspaceID: "ws", DocID: "d2", TurnID: "t3"})
	if n := l.ActiveByDoc("ws", "d1"); n != 2 {
		t.Fatalf("active d1 = %d want 2", n)
	}
	if n := l.ActiveByDoc("ws", "d2"); n != 1 {
		t.Fatalf("active d2 = %d want 1", n)
	}
	if n := l.ActiveByDoc("ws", "missing"); n != 0 {
		t.Fatalf("active missing = %d want 0", n)
	}
}

func TestRetract(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t2"})
	if err := l.Retract("ws", "d1", "audit"); err != nil {
		t.Fatalf("retract: %v", err)
	}
	if n := l.ActiveByDoc("ws", "d1"); n != 0 {
		t.Fatalf("active after retract = %d want 0", n)
	}
}

func TestRetractNotFound(t *testing.T) {
	l := NewLog()
	err := l.Retract("ws", "missing", "")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestEnsureDeletedBlocksWhenActive(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	err := l.EnsureDeleted("ws", "d1")
	if !errors.Is(err, ErrActiveCitations) {
		t.Fatalf("expected ErrActiveCitations, got %v", err)
	}
}

func TestEnsureDeletedPassesAfterRetract(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	if err := l.Retract("ws", "d1", ""); err != nil {
		t.Fatalf("retract: %v", err)
	}
	if err := l.EnsureDeleted("ws", "d1"); err != nil {
		t.Fatalf("ensure deleted: %v", err)
	}
}

func TestEnsureDeletedPassesForUnknown(t *testing.T) {
	l := NewLog()
	if err := l.EnsureDeleted("ws", "unknown"); err != nil {
		t.Fatalf("unknown doc should not block delete: %v", err)
	}
}

func TestListByDocNewestFirst(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1", CreatedAt: time.Now()})
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t2", CreatedAt: time.Now().Add(time.Second)})
	rs := l.ListByDoc("ws", "d1")
	if len(rs) != 2 {
		t.Fatalf("len=%d", len(rs))
	}
	if rs[0].TurnID != "t2" || rs[1].TurnID != "t1" {
		t.Fatalf("newest first order wrong: %+v", rs)
	}
}

func TestListByTurn(t *testing.T) {
	l := NewLog()
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	l.Append(Record{WorkspaceID: "ws", DocID: "d2", TurnID: "t2"})
	l.Append(Record{WorkspaceID: "ws", DocID: "d1", TurnID: "t1"})
	rs := l.ListByTurn("t1")
	if len(rs) != 2 {
		t.Fatalf("t1 has %d records, want 2", len(rs))
	}
}

func TestFormatQuoteTruncates(t *testing.T) {
	q := FormatQuote("abcdefghij", 5)
	if q != "abcde…" {
		t.Fatalf("got %q", q)
	}
}

func TestFormatQuotePassThrough(t *testing.T) {
	q := FormatQuote("hello", 100)
	if q != "hello" {
		t.Fatalf("got %q", q)
	}
}
