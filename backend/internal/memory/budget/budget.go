// Package budget implements priority + paragraph-truncation selection for
// the memory center's "what to inject" path.
//
// Replaces the prior "first N items by score" in
// copilot_context.go:selectMemoryHitsLocked. Real Budgeter:
//
//   - Sorts candidates by (priority desc, score desc, freshness desc).
//   - Walks the sorted list, accumulating against a token budget.
//   - Truncates each item's content at paragraph boundary if it would
//     overflow the budget; keeps the title verbatim.
//   - Returns the slice + a report that says what was dropped.
package budget

import (
	"sort"
	"strings"
)

// Candidate is one memory candidate.
type Candidate struct {
	ID         string
	Title      string
	Content    string
	Score      float64
	Priority   int       // 0 (low) .. 3 (critical). Higher wins.
	Source     string
	RecencyNs  int64     // nanoseconds (used as tie-break when scores tie)
}

// Item is the budgeted result for one candidate.
type Item struct {
	Candidate
	Truncated bool   // true if Content was cut at paragraph boundary
	Tokens    int    // estimated tokens used
}

// Report summarizes the budget decision.
type Report struct {
	BudgetTokens   int
	UsedTokens     int
	Kept           int
	Dropped        int
	TruncatedItems int
	DroppedIDs     []string
}

// Select applies priority sort + token budget + paragraph truncation.
// Returns the chosen items + a Report describing what was dropped.
//
// tokensPerChar is the rough ratio (default 0.5 — about 2 chars per token
// for English/CJK mixed; tune via env if needed).
func Select(cands []Candidate, budgetTokens int, tokensPerChar float64) ([]Item, Report) {
	rep := Report{BudgetTokens: budgetTokens}
	if budgetTokens <= 0 || len(cands) == 0 {
		rep.Dropped = len(cands)
		for _, c := range cands {
			rep.DroppedIDs = append(rep.DroppedIDs, c.ID)
		}
		return nil, rep
	}
	if tokensPerChar <= 0 {
		tokensPerChar = 0.5
	}
	sorted := make([]Candidate, len(cands))
	copy(sorted, cands)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Priority != sorted[j].Priority {
			return sorted[i].Priority > sorted[j].Priority
		}
		if sorted[i].Score != sorted[j].Score {
			return sorted[i].Score > sorted[j].Score
		}
		return sorted[i].RecencyNs > sorted[j].RecencyNs
	})
	used := 0
	out := []Item{}
	dropped := []string{}
	for _, c := range sorted {
		title := strings.TrimSpace(c.Title)
		body := strings.TrimSpace(c.Content)
		titleTokens := int(float64(len([]rune(title))) * tokensPerChar)
		remaining := budgetTokens - used - titleTokens - 2 // +2 for separator
		if remaining <= 0 {
			dropped = append(dropped, c.ID)
			continue
		}
		bodyTokens := int(float64(len([]rune(body))) * tokensPerChar)
		truncated := false
		if bodyTokens > remaining {
			body = truncateAtParagraph(body, remaining, tokensPerChar)
			truncated = true
			bodyTokens = remaining
			rep.TruncatedItems++
		}
		used += titleTokens + bodyTokens + 2
		out = append(out, Item{
			Candidate: Candidate{
				ID: c.ID, Title: title, Content: body, Score: c.Score,
				Priority: c.Priority, Source: c.Source, RecencyNs: c.RecencyNs,
			},
			Truncated: truncated,
			Tokens:    titleTokens + bodyTokens + 2,
		})
		if used >= budgetTokens {
			// Drop the rest.
			for _, rest := range sorted[len(out):] {
				if rest.ID != "" {
					dropped = append(dropped, rest.ID)
				}
			}
			break
		}
	}
	rep.UsedTokens = used
	rep.Kept = len(out)
	rep.Dropped = len(dropped)
	rep.DroppedIDs = dropped
	return out, rep
}

// truncateAtParagraph cuts body so its rune count fits the token budget.
// Prefers paragraph boundaries (\n\n); falls back to sentence-end punctuation;
// falls back to rune cut.
func truncateAtParagraph(body string, budgetTokens int, tokensPerChar float64) string {
	maxRunes := int(float64(budgetTokens) / tokensPerChar)
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(body)
	if len(runes) <= maxRunes {
		return body
	}
	// Look for paragraph break within the budget.
	bestPara := -1
	for i := 0; i < len(runes) && i < maxRunes; i++ {
		if i+1 < len(runes) && runes[i] == '\n' && runes[i+1] == '\n' {
			bestPara = i + 2
		}
	}
	if bestPara > 0 {
		return string(runes[:bestPara]) + "…"
	}
	// Look for sentence end.
	for i := maxRunes; i > maxRunes-80 && i > 0; i-- {
		r := runes[i-1]
		if r == '。' || r == '.' || r == '!' || r == '?' || r == '\n' {
			return string(runes[:i]) + "…"
		}
	}
	return string(runes[:maxRunes]) + "…"
}
