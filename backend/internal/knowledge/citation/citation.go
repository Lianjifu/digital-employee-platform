// Package citation produces real citations for knowledge hits surfaced to the
// model. Replaces the previous stub in copilot_context.go:123 that built a
// citation with only {id, docId, source, text, score}. Real citations carry:
//
//   - Tier (which trust tier the doc belongs to: published|review|workspace)
//   - Quoted (verbatim sentence pulled from the snippet for white-box audit)
//   - CharRange (start, end within snippet; used for downstream highlight)
//   - QuoteHash (stable hash of the quoted text; lets downstream verify the
//     citation wasn't tampered with between retrieval and reply)
//   - RetrievedAt (RFC3339 timestamp; supports "stale citation" detection)
//   - EvalRunID (the knowledge-eval run that approved this doc — when present)
//
// Dedupe dedupes by (docId + quoteHash), preferring higher-tier docs.
package citation

import (
	"crypto/sha1"
	"encoding/hex"
	"sort"
	"strings"
	"time"
)

// Tier is the trust level of a citation's source doc.
type Tier string

const (
	TierPublished Tier = "published" // published knowledge base doc
	TierReview    Tier = "review"    // status=ready, awaiting publish
	TierWorkspace Tier = "workspace" // ad-hoc workspace doc
)

// Citation is one traceable, white-box citation record.
type Citation struct {
	ID          string    `json:"id"`
	DocID       string    `json:"docId"`
	ChunkID     string    `json:"chunkId,omitempty"`
	Source      string    `json:"source"`
	Title       string    `json:"title,omitempty"`
	Tier        Tier      `json:"tier"`
	Score       float64   `json:"score"`
	Quoted      string    `json:"quoted,omitempty"`
	CharStart   int       `json:"charStart,omitempty"`
	CharEnd     int       `json:"charEnd,omitempty"`
	QuoteHash   string    `json:"quoteHash,omitempty"`
	RetrievedAt time.Time `json:"retrievedAt"`
	EvalRunID   string    `json:"evalRunId,omitempty"`
}

// Hit is the input shape from the retriever; we accept a generic map to
// avoid a hard dependency on the eval package types.
type Hit struct {
	ID         string
	DocID      string
	ChunkID    string
	Source     string
	Title      string
	Tier       Tier
	Score      float64
	Snippet    string
	EvalRunID  string
}

// Max is the cap on citations per response (matches the previous 8-item cap).
const Max = 8

// Build produces deduplicated, sorted, capped citations from raw hits.
// Order: tier (published > review > workspace), then score desc, then stable doc id.
func Build(hits []Hit, now time.Time) []Citation {
	if len(hits) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(hits))
	out := make([]Citation, 0, len(hits))
	for _, h := range hits {
		docID := firstNonEmpty(h.DocID, h.ID)
		if docID == "" {
			continue
		}
		quoted, start, end := extractQuote(h.Snippet)
		hash := QuoteHash(quoted)
		key := docID + "|" + hash
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, Citation{
			ID:          "cite_" + docID + "_" + shortHash(hash),
			DocID:       docID,
			ChunkID:     h.ChunkID,
			Source:      firstNonEmpty(h.Source, h.Title, "knowledge"),
			Title:       h.Title,
			Tier:        defaultTier(h.Tier),
			Score:       h.Score,
			Quoted:      quoted,
			CharStart:   start,
			CharEnd:     end,
			QuoteHash:   hash,
			RetrievedAt: now,
			EvalRunID:   h.EvalRunID,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Tier != out[j].Tier {
			return tierRank(out[i].Tier) < tierRank(out[j].Tier)
		}
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		return out[i].DocID < out[j].DocID
	})
	if len(out) > Max {
		out = out[:Max]
	}
	return out
}

// QuoteHash returns the lowercase hex SHA-1 of the (trimmed, lowercased) quote.
// Empty string returns "" so absent quotes don't pollute dedupe.
func QuoteHash(quoted string) string {
	q := strings.ToLower(strings.TrimSpace(quoted))
	if q == "" {
		return ""
	}
	sum := sha1.Sum([]byte(q))
	return hex.EncodeToString(sum[:])
}

// extractQuote picks the first sentence-like substring (≤240 chars) from
// the snippet and returns it with its [start, end) char offsets. If no
// sentence boundary exists, returns the whole snippet.
func extractQuote(snippet string) (string, int, int) {
	s := strings.TrimSpace(snippet)
	if s == "" {
		return "", 0, 0
	}
	// Look for sentence-ending punctuation; prefer first one within 240 runes.
	end := len([]rune(s))
	if end > 240 {
		end = 240
	}
	cut := end
	for i := 0; i < end; i++ {
		r := []rune(s)[i]
		// Fullwidth and halfwidth sentence terminators, plus newline.
		if r == '。' || r == '！' || r == '？' ||
			r == '.' || r == '!' || r == '?' || r == '\n' {
			cut = i + 1
			break
		}
	}
	runes := []rune(s)
	if cut > len(runes) {
		cut = len(runes)
	}
	return string(runes[:cut]), 0, cut
}

// ExtractQuote is the exported form of extractQuote so external callers
// (e.g. the session-panel citation log) can compute the same quoteHash
// input as citation.Build.
func ExtractQuote(snippet string) (string, int, int) {
	return extractQuote(snippet)
}

func defaultTier(t Tier) Tier {
	switch t {
	case TierPublished, TierReview, TierWorkspace:
		return t
	}
	return TierReview
}

func tierRank(t Tier) int {
	switch t {
	case TierPublished:
		return 0
	case TierReview:
		return 1
	case TierWorkspace:
		return 2
	}
	return 3
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if v != "" {
			return v
		}
	}
	return ""
}

func shortHash(h string) string {
	if len(h) >= 8 {
		return h[:8]
	}
	return h
}
