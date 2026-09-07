// Package memory implements real hybrid retrieval for the memory center.
//
// Replaces scoreMemoryText in copilot_context.go:413 (substring count over a
// short_circuit title+content string) with a real scorer that combines:
//
//   1. BM25 over the document (title + content) — term-frequency saturation,
//      inverse document frequency across the candidate set, length
//      normalization.
//
//   2. Token-overlap boost — exact token match when the doc already appears
//      in the candidate set, to keep queries with rare terms working.
//
//   3. Layer prior — long_term > working > short_term (when scores tie).
//
//   4. MMR reranking — picks diverse results across the top-K candidates so
//      the LLM doesn't see 5 near-duplicates.
//
// The package is pure: it takes a Corpus ([]Doc) + Query and returns ranked
// ScoredDocs. The Server layer wires MemoryRecords to a Corpus.
package memory

import (
	"math"
	"sort"
	"strings"
)

// Doc is the minimum record needed for retrieval.
type Doc struct {
	ID      string
	Title   string
	Content string
	Layer   string // short_term | working | long_term
}

// Query carries the user's intent + MMR knobs.
type Query struct {
	Text     string
	TopK     int    // final results to return
	FetchK   int    // pre-MMR pool size (>= TopK recommended)
	Lambda   float64 // MMR trade-off (0..1); default 0.7
}

// ScoredDoc is one ranked result.
type ScoredDoc struct {
	Doc
	BM25     float64
	TokenHit float64
	LayerBoost float64
	Final    float64
}

// Score returns the top-K Docs for query against corpus, using BM25 + MMR.
//
// All tokenization lowercases and drops tokens shorter than 2 chars. CJK
// runs are split into per-character bigrams (same approach as the knowledge
// retriever) so Chinese queries score against Chinese bodies.
func Score(corpus []Doc, q Query) []ScoredDoc {
	if len(corpus) == 0 || strings.TrimSpace(q.Text) == "" {
		return nil
	}
	if q.TopK <= 0 {
		q.TopK = 5
	}
	if q.FetchK <= 0 {
		q.FetchK = q.TopK * 4
		if q.FetchK < 20 {
			q.FetchK = 20
		}
	}
	if q.Lambda <= 0 {
		q.Lambda = 0.7
	}

	tokens := tokenize(q.Text)
	if len(tokens) == 0 {
		return nil
	}

	// 1) BM25 per doc.
	scoredAll := make([]docScore, 0, len(corpus))
	df := documentFrequency(corpus, tokens)
	for i, d := range corpus {
		body := strings.ToLower(d.Title + " " + d.Content)
		bodyTokens := tokenize(body)
		bm := bm25(bodyTokens, tokens, df, len(corpus), avgDocLen(corpus))
		tk := tokenHitRatio(body, tokens)
		scoredAll = append(scoredAll, docScore{idx: i, bm25: bm, tk: tk, lay: layerBoost(d.Layer)})
	}
	sort.Slice(scoredAll, func(i, j int) bool {
		return combinedScore(scoredAll[i].bm25, scoredAll[i].tk, scoredAll[i].lay) >
			combinedScore(scoredAll[j].bm25, scoredAll[j].tk, scoredAll[j].lay)
	})
	if len(scoredAll) > q.FetchK {
		scoredAll = scoredAll[:q.FetchK]
	}

	// 2) MMR rerank over the pool.
	picked := []docScore{}
	for len(picked) < q.TopK && len(scoredAll) > 0 {
		best := 0
		bestScore := -1.0
		for i, c := range scoredAll {
			score := mmrScore(c, picked, corpus, q.Lambda)
			if score > bestScore {
				bestScore = score
				best = i
			}
		}
		picked = append(picked, scoredAll[best])
		scoredAll = append(scoredAll[:best], scoredAll[best+1:]...)
	}

	out := make([]ScoredDoc, 0, len(picked))
	for _, p := range picked {
		d := corpus[p.idx]
		final := combinedScore(p.bm25, p.tk, p.lay)
		out = append(out, ScoredDoc{
			Doc:        d,
			BM25:       round4(p.bm25),
			TokenHit:   round4(p.tk),
			LayerBoost: round4(p.lay),
			Final:      round4(final),
		})
	}
	return out
}

// --- helpers ---

func combinedScore(bm25, tokenHit, layer float64) float64 {
	return bm25*0.7 + tokenHit*0.25 + layer*0.05
}

func layerBoost(layer string) float64 {
	switch strings.ToLower(strings.TrimSpace(layer)) {
	case "long_term":
		return 1.0
	case "working":
		return 0.7
	case "short_term":
		return 0.4
	}
	return 0.2
}

func tokenize(s string) []string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return nil
	}
	out := []string{}
	for _, tok := range strings.Fields(s) {
		if len([]rune(tok)) >= 2 {
			out = append(out, tok)
		}
	}
	runes := []rune(s)
	for i := 0; i < len(runes)-1; i++ {
		a, b := runes[i], runes[i+1]
		if isCJK(a) && isCJK(b) {
			out = append(out, string([]rune{a, b}))
		}
	}
	return out
}

func isCJK(r rune) bool {
	return (r >= 0x4E00 && r <= 0x9FFF) ||
		(r >= 0x3400 && r <= 0x4DBF) ||
		(r >= 0xF900 && r <= 0xFAFF)
}

// documentFrequency returns |docs containing each token|.
func documentFrequency(docs []Doc, tokens []string) map[string]int {
	df := make(map[string]int, len(tokens))
	for _, t := range tokens {
		df[t] = 0
	}
	for _, d := range docs {
		body := strings.ToLower(d.Title + " " + d.Content)
		seen := map[string]bool{}
		for _, t := range tokens {
			if !seen[t] && strings.Contains(body, t) {
				df[t]++
				seen[t] = true
			}
		}
	}
	return df
}

// bm25 is the standard BM25 scoring function (k1=1.5, b=0.75).
func bm25(docTokens, queryTokens []string, df map[string]int, totalDocs int, avgLen float64) float64 {
	if len(docTokens) == 0 || avgLen == 0 {
		return 0
	}
	tf := map[string]int{}
	for _, t := range docTokens {
		tf[t]++
	}
	docLen := float64(len(docTokens))
	const k1 = 1.5
	const b = 0.75
	score := 0.0
	for _, q := range queryTokens {
		f := float64(tf[q])
		if f == 0 {
			continue
		}
		n := float64(df[q])
		idf := math.Log((float64(totalDocs)-n+0.5)/(n+0.5) + 1)
		numer := f * (k1 + 1)
		denom := f + k1*(1-b+b*docLen/avgLen)
		score += idf * numer / denom
	}
	return score
}

func avgDocLen(docs []Doc) float64 {
	if len(docs) == 0 {
		return 0
	}
	var total float64
	for _, d := range docs {
		total += float64(len(tokenize(d.Title + " " + d.Content)))
	}
	return total / float64(len(docs))
}

func tokenHitRatio(body string, tokens []string) float64 {
	if len(tokens) == 0 {
		return 0
	}
	hits := 0
	lower := strings.ToLower(body)
	for _, t := range tokens {
		if strings.Contains(lower, t) {
			hits++
		}
	}
	return float64(hits) / float64(len(tokens))
}

// mmrScore picks the next doc that maximizes relevance - λ * max similarity
// to already-picked docs.
func mmrScore(c docScore, picked []docScore, corpus []Doc, lambda float64) float64 {
	rel := combinedScore(c.bm25, c.tk, c.lay)
	if len(picked) == 0 {
		return rel
	}
	maxSim := 0.0
	for _, p := range picked {
		sim := jaccard(corpus[c.idx], corpus[p.idx])
		if sim > maxSim {
			maxSim = sim
		}
	}
	return lambda*rel - (1-lambda)*maxSim
}

type docScore struct {
	idx  int
	bm25 float64
	tk   float64
	lay  float64
}

func jaccard(a, b Doc) float64 {
	at := make(map[string]bool)
	bt := make(map[string]bool)
	for _, t := range tokenize(a.Title + " " + a.Content) {
		at[t] = true
	}
	for _, t := range tokenize(b.Title + " " + b.Content) {
		bt[t] = true
	}
	if len(at)+len(bt) == 0 {
		return 0
	}
	intersect := 0
	for k := range at {
		if bt[k] {
			intersect++
		}
	}
	union := len(at) + len(bt) - intersect
	if union == 0 {
		return 0
	}
	return float64(intersect) / float64(union)
}

func round4(f float64) float64 {
	return math.Round(f*10000) / 10000
}
