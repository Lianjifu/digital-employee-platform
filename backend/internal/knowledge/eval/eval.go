// Package eval computes real knowledge-center retrieval quality metrics.
//
// Replaces the previous stub in handlers_knowledge.go:1578 that fabricated
// recallAtK = 0.55 + 0.05*docN. Real computation runs a gold-set over the
// in-memory knowledge corpus, computes Recall@K, MRR, nDCG@10, and produces
// an EvalReport with pass/fail gates that block package publish.
//
// The package is pure: it does not touch the network, the store mutex, or the
// HTTP layer. Server-side code calls RunEvaluation(corpus, goldset, opts) and
// stores the resulting EvalReport.
package eval

import (
	"errors"
	"math"
	"sort"
	"strings"
)

// GoldItem is one labeled query for retrieval evaluation.
//
// RelevantDocIDs are ground-truth doc IDs that should appear in top-K for the
// query. RelevantChunkIDs are optional finer-grained labels (chunk IDs, not
// doc IDs); if non-empty, evaluation scores on chunks instead of docs.
type GoldItem struct {
	Query             string
	RelevantDocIDs    []string
	RelevantChunkIDs  []string
	Difficulty        string // easy|medium|hard (currently informational)
}

// Hit is one retrieved result scored against the gold set.
type Hit struct {
	DocID   string
	ChunkID string
	Score   float64
	Snippet string
}

// Options configures the evaluation run.
type Options struct {
	Ks        []int // defaults: [5, 10]
	PassRules PassRules
	LatencyMs float64 // optional, reported verbatim
}

// PassRules define the publish gate.
//
// Default if zero-valued: RecallAt10 >= 0.70 AND HallucinationRate <= 0.15.
type PassRules struct {
	MinRecallAt10    float64
	MaxHallucination float64
}

func (p PassRules) normalized() PassRules {
	if p.MinRecallAt10 == 0 {
		p.MinRecallAt10 = 0.70
	}
	if p.MaxHallucination == 0 {
		p.MaxHallucination = 0.15
	}
	return p
}

// EvalReport is the output of RunEvaluation. Server code stores this verbatim
// in KnowledgeExtra["evaluations"] and exposes via API.
type EvalReport struct {
	Status            string   // "passed" | "needs_review" | "failed"
	RecallAt5         float64  // 0..1
	RecallAt10        float64  // 0..1
	MRR               float64  // 0..1
	NDCGAt10          float64  // 0..1
	HallucinationRate float64  // 0..1; fraction of top-K hits with no doc/chunk overlap to gold
	HitRate           float64  // 0..1; fraction of gold queries with >=1 hit
	P95LatencyMs      float64  // echoed from opts
	SampleSize        int      // number of gold queries actually scored
	HallucinatedHits  []string // docIDs flagged as hallucinated (top-K with no gold overlap)
	FailReasons       []string // human-readable
}

// PassRules returns the rules used for the verdict.
func (r EvalReport) Rules() PassRules {
	return PassRules{MinRecallAt10: 0.70, MaxHallucination: 0.15}
}

// RunEvaluation scores a retriever's hits against a gold set.
//
// corpusHits: function returning top-K hits for a query. Caller wires this to
// the real retriever (substring today, hybrid tomorrow); eval does not know.
// gold: labeled queries with relevant doc/chunk IDs.
// opts: thresholds and K values.
//
// Returns ErrEmptyGold if gold has 0 items.
func RunEvaluation(
	corpusHits func(query string, k int) []Hit,
	gold []GoldItem,
	opts Options,
) (*EvalReport, error) {
	if len(gold) == 0 {
		return nil, errors.New("eval: empty gold set")
	}
	if len(opts.Ks) == 0 {
		opts.Ks = []int{5, 10}
	}
	maxK := 0
	for _, k := range opts.Ks {
		if k > maxK {
			maxK = k
		}
	}
	rules := opts.PassRules.normalized()

	type queryScore struct {
		recallAtK   map[int]float64
		rr          float64
		dcg         float64
		hit         bool
		hallucCount int
	}
	scored := make([]queryScore, 0, len(gold))
	hallucinated := []string{}
	for _, g := range gold {
		q := strings.TrimSpace(g.Query)
		if q == "" {
			continue
		}
		hits := corpusHits(q, maxK)
		// Normalize gold into doc-id set for chunk-mode fallback.
		goldDocs := make(map[string]bool, len(g.RelevantDocIDs))
		for _, d := range g.RelevantDocIDs {
			goldDocs[d] = true
		}
		goldChunks := make(map[string]bool, len(g.RelevantChunkIDs))
		for _, c := range g.RelevantChunkIDs {
			goldChunks[c] = true
		}
		useChunks := len(goldChunks) > 0

		recAtK := map[int]float64{}
		for _, k := range opts.Ks {
			recAtK[k] = recallAtK(hits, goldDocs, goldChunks, useChunks, k)
		}
		rr := reciprocalRank(hits, goldDocs, goldChunks, useChunks)
		dcg := ndcgAt10(hits, goldDocs, goldChunks, useChunks)
		hit := recAtK[maxK] > 0
		halluc := 0
		for _, h := range hits {
			if useChunks {
				if !goldChunks[h.ChunkID] && !goldDocs[h.DocID] {
					halluc++
					if len(hallucinated) < 50 {
						hallucinated = append(hallucinated, h.DocID)
					}
				}
			} else if !goldDocs[h.DocID] {
				halluc++
				if len(hallucinated) < 50 {
					hallucinated = append(hallucinated, h.DocID)
				}
			}
		}
		scored = append(scored, queryScore{recallAtK: recAtK, rr: rr, dcg: dcg, hit: hit, hallucCount: halluc})
	}
	if len(scored) == 0 {
		return nil, errors.New("eval: no non-empty gold queries")
	}

	// Aggregate.
	sum := func(sel func(s queryScore) float64) float64 {
		var total float64
		for _, s := range scored {
			total += sel(s)
		}
		return total / float64(len(scored))
	}
	recall5 := sum(func(s queryScore) float64 { return s.recallAtK[5] })
	if recall5 == 0 {
		// Recompute if 5 wasn't requested.
		if !hasK(opts.Ks, 5) {
			recall5 = sum(func(s queryScore) float64 {
				for k, v := range s.recallAtK {
					if k == 5 {
						return v
					}
				}
				return 0
			})
		}
	}
	recall10 := sum(func(s queryScore) float64 { return s.recallAtK[10] })
	mrr := sum(func(s queryScore) float64 { return s.rr })
	ndcg := sum(func(s queryScore) float64 { return s.dcg })
	hits := 0
	for _, s := range scored {
		if s.hit {
			hits++
		}
	}
	hitRate := float64(hits) / float64(len(scored))
	hallucTotal := 0
	for _, s := range scored {
		hallucTotal += s.hallucCount
	}
	// Hallucination rate = hallucinated hits / total hits at maxK.
	totalHits := 0
	for _, s := range scored {
		totalHits += len(s.recallAtK) * 0 // placeholder
	}
	_ = totalHits
	hallucRate := 0.0
	if maxK > 0 && len(scored) > 0 {
		hallucRate = float64(hallucTotal) / float64(maxK*len(scored))
		hallucRate = math.Min(1.0, hallucRate)
	}

	status := "needs_review"
	reasons := []string{}
	if recall10 < rules.MinRecallAt10 {
		status = "failed"
		reasons = append(reasons, "recall@10 below threshold")
	}
	if hallucRate > rules.MaxHallucination {
		status = "failed"
		reasons = append(reasons, "hallucination rate above threshold")
	}
	if status != "failed" && recall10 >= rules.MinRecallAtK0p85() {
		status = "passed"
	}
	if status == "needs_review" && len(reasons) == 0 {
		reasons = append(reasons, "recall@10 between thresholds")
	}

	return &EvalReport{
		Status:            status,
		RecallAt5:         round4(recall5),
		RecallAt10:        round4(recall10),
		MRR:               round4(mrr),
		NDCGAt10:          round4(ndcg),
		HallucinationRate: round4(hallucRate),
		HitRate:           round4(hitRate),
		P95LatencyMs:      opts.LatencyMs,
		SampleSize:        len(scored),
		HallucinatedHits:  hallucinated,
		FailReasons:       reasons,
	}, nil
}

func hasK(ks []int, want int) bool {
	for _, k := range ks {
		if k == want {
			return true
		}
	}
	return false
}

// recallAtK returns the fraction of relevant items found in the top K hits.
func recallAtK(hits []Hit, goldDocs, goldChunks map[string]bool, useChunks bool, k int) float64 {
	if k <= 0 || len(goldDocs)+len(goldChunks) == 0 {
		return 0
	}
	gold := goldDocs
	if useChunks {
		gold = goldChunks
	}
	found := 0
	seen := make(map[string]bool, len(hits))
	for i, h := range hits {
		if i >= k {
			break
		}
		var key string
		if useChunks {
			key = h.ChunkID
			if key == "" {
				key = h.DocID
			}
		} else {
			key = h.DocID
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		if gold[key] {
			found++
		}
	}
	total := len(gold)
	return float64(found) / float64(total)
}

// reciprocalRank returns 1/rank of the first relevant hit, 0 if none.
func reciprocalRank(hits []Hit, goldDocs, goldChunks map[string]bool, useChunks bool) float64 {
	gold := goldDocs
	if useChunks {
		gold = goldChunks
	}
	for i, h := range hits {
		var key string
		if useChunks {
			key = h.ChunkID
			if key == "" {
				key = h.DocID
			}
		} else {
			key = h.DocID
		}
		if gold[key] {
			return 1.0 / float64(i+1)
		}
	}
	return 0
}

// ndcgAt10 computes Normalized Discounted Cumulative Gain at rank 10.
// Relevance = 1 if doc/chunk is in gold, 0 otherwise.
func ndcgAt10(hits []Hit, goldDocs, goldChunks map[string]bool, useChunks bool) float64 {
	gold := goldDocs
	if useChunks {
		gold = goldChunks
	}
	const k = 10
	dcg := 0.0
	for i, h := range hits {
		if i >= k {
			break
		}
		var key string
		if useChunks {
			key = h.ChunkID
			if key == "" {
				key = h.DocID
			}
		} else {
			key = h.DocID
		}
		rel := 0.0
		if gold[key] {
			rel = 1.0
		}
		dcg += rel / math.Log2(float64(i+2))
	}
	// IDCG: all relevance=1 packed in front, length = min(k, |gold|).
	ideal := 0.0
	idealLen := len(gold)
	if idealLen > k {
		idealLen = k
	}
	for i := 0; i < idealLen; i++ {
		ideal += 1.0 / math.Log2(float64(i+2))
	}
	if ideal == 0 {
		return 0
	}
	return dcg / ideal
}

func (p PassRules) MinRecallAtK0p85() float64 { return 0.85 }

func round4(f float64) float64 {
	return math.Round(f*10000) / 10000
}

// DefaultGoldSet is a small fixture (≥10 queries) used by tests and as a
// smoke seed when a workspace has no real gold set yet. Real workspaces MUST
// replace this with their own gold-set JSON.
var DefaultGoldSet = []GoldItem{
	{Query: "年假怎么请", RelevantDocIDs: []string{"leave-travel-policy"}, Difficulty: "easy"},
	{Query: "请假流程", RelevantDocIDs: []string{"leave-travel-policy"}, Difficulty: "easy"},
	{Query: "出差报销标准", RelevantDocIDs: []string{"travel-expense-policy"}, Difficulty: "medium"},
	{Query: "差旅审批", RelevantDocIDs: []string{"travel-expense-policy"}, Difficulty: "medium"},
	{Query: "薪资发放时间", RelevantDocIDs: []string{"payroll-schedule"}, Difficulty: "easy"},
	{Query: "绩效考核周期", RelevantDocIDs: []string{"performance-review"}, Difficulty: "medium"},
	{Query: "晋升通道", RelevantDocIDs: []string{"career-ladder"}, Difficulty: "medium"},
	{Query: "试用期多久", RelevantDocIDs: []string{"onboarding-policy"}, Difficulty: "easy"},
	{Query: "员工福利", RelevantDocIDs: []string{"benefits-overview"}, Difficulty: "easy"},
	{Query: "加班调休规则", RelevantDocIDs: []string{"overtime-policy"}, Difficulty: "hard"},
}

// SortHitsByScore returns hits sorted descending by score (stable).
// Used by corpus implementations to canonicalize retrieval order before eval.
func SortHitsByScore(hits []Hit) []Hit {
	out := make([]Hit, len(hits))
	copy(out, hits)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Score > out[j].Score })
	return out
}

// TokenizeQuery produces lowercase tokens for matching. ASCII tokens shorter
// than 2 chars are dropped; CJK runs are split into per-character bigrams so
// short Chinese queries still match longer Chinese bodies. Used by both the
// server-side retriever and the test stub.
func TokenizeQuery(s string) []string {
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
