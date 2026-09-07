// Package citationlog records every citation surfaced into a turn and
// enforces the "delete doc with active citations → 409" guard.
//
// In-memory store backed by Server.Store.KnowledgeExtra["citationLog"]
// (shape: []map[string]any). Postgres persistence is a future migration.
//
// Record shape:
//
//	id           : "clog-<rand>"
//	workspaceId  : ws
//	turnId       : the chat turn that produced this citation
//	docId        : cited doc
//	chunkId      : cited chunk (optional)
//	tier         : published|review|workspace
//	quoteHash    : sha1(quote) from the citation package
//	score        : retriever score at citation time
//	createdAt    : RFC3339
//	retractedAt  : empty unless the citation was later retracted
package citationlog

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// Record is one logged citation event.
type Record struct {
	ID          string
	WorkspaceID string
	TurnID      string
	DocID       string
	ChunkID     string
	Tier        string
	QuoteHash   string
	Score       float64
	CreatedAt   time.Time
	RetractedAt time.Time
}

// ErrActiveCitations blocks deletion when a doc still has un-retracted citations.
var ErrActiveCitations = errors.New("doc has active citations")

// ErrNotFound is returned by Retract/GetByDoc when no record matches.
var ErrNotFound = errors.New("citation log: not found")

// Log is a thread-safe in-memory log. The Server wraps this behind its
// KnowledgeExtra mutex, but exposing a dedicated type keeps callers from
// racing on raw map mutations.
type Log struct {
	mu      sync.RWMutex
	nextSeq int
	records []Record
}

// NewLog returns an empty log.
func NewLog() *Log {
	return &Log{}
}

// Append records a citation event. Returns the assigned ID.
func (l *Log) Append(r Record) string {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.nextSeq++
	r.ID = fmt.Sprintf("clog-%07d", l.nextSeq)
	if r.CreatedAt.IsZero() {
		r.CreatedAt = time.Now().UTC()
	}
	l.records = append(l.records, r)
	return r.ID
}

// ActiveByDoc returns the number of citations for docID that have not been
// retracted. Used by the doc-delete handler to gate on 409.
func (l *Log) ActiveByDoc(workspaceID, docID string) int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	n := 0
	for _, r := range l.records {
		if r.WorkspaceID != workspaceID || r.DocID != docID {
			continue
		}
		if r.RetractedAt.IsZero() {
			n++
		}
	}
	return n
}

// Retract marks all citations of a doc as retracted (no-op if none).
// Returns ErrNotFound if there are no records for this doc.
func (l *Log) Retract(workspaceID, docID, reason string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	found := false
	now := time.Now().UTC()
	for i := range l.records {
		if l.records[i].WorkspaceID != workspaceID || l.records[i].DocID != docID {
			continue
		}
		if l.records[i].RetractedAt.IsZero() {
			l.records[i].RetractedAt = now
			found = true
		}
	}
	if !found {
		return ErrNotFound
	}
	_ = reason
	return nil
}

// ListByDoc returns all records for docID, newest first.
func (l *Log) ListByDoc(workspaceID, docID string) []Record {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := []Record{}
	for i := len(l.records) - 1; i >= 0; i-- {
		r := l.records[i]
		if r.WorkspaceID == workspaceID && r.DocID == docID {
			out = append(out, r)
		}
	}
	return out
}

// ListByTurn returns all records for a chat turn.
func (l *Log) ListByTurn(turnID string) []Record {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := []Record{}
	for i := len(l.records) - 1; i >= 0; i-- {
		if l.records[i].TurnID == turnID {
			out = append(out, l.records[i])
		}
	}
	return out
}

// EnsureDeleted is the guard helper callers wrap their delete in:
//
//	if err := log.EnsureDeleted(ws, docID); err != nil {
//	    return nil, apperr.Conflict("knowledge.citation_active", err.Error())
//	}
//
// Returns ErrActiveCitations when active citations exist.
func (l *Log) EnsureDeleted(workspaceID, docID string) error {
	if l.ActiveByDoc(workspaceID, docID) > 0 {
		return fmt.Errorf("%w: docId=%s workspaceId=%s active=%d",
			ErrActiveCitations, docID, workspaceID, l.ActiveByDoc(workspaceID, docID))
	}
	return nil
}

// FormatQuote is a small helper kept here so the API surface can surface a
// human-readable citation trail.
func FormatQuote(quote string, max int) string {
	quote = strings.TrimSpace(quote)
	if max > 0 && len([]rune(quote)) > max {
		runes := []rune(quote)
		return string(runes[:max]) + "…"
	}
	return quote
}
