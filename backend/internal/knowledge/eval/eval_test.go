package eval

import (
	"strings"
	"testing"
)

// corpusStub simulates the in-memory knowledge corpus retriever. It scores
// each doc by the number of query tokens (per TokenizeQuery) that appear in
// the body — a stand-in for the real hybrid retriever that will land
// alongside pgvector.
func corpusStub(docs map[string]string) func(query string, k int) []Hit {
	return func(query string, k int) []Hit {
		type cand struct {
			id    string
			score float64
			snip  string
		}
		tokens := TokenizeQuery(query)
		if len(tokens) == 0 {
			return nil
		}
		var cands []cand
		for id, body := range docs {
			bl := strings.ToLower(body)
			score := 0.0
			for _, tok := range tokens {
				if strings.Contains(bl, tok) {
					score++
				}
			}
			if score > 0 {
				cands = append(cands, cand{id: id, score: score, snip: body})
			}
		}
		for i := 0; i < len(cands); i++ {
			for j := i + 1; j < len(cands); j++ {
				if cands[j].score > cands[i].score {
					cands[i], cands[j] = cands[j], cands[i]
				}
			}
		}
		out := make([]Hit, 0, k)
		for i := 0; i < len(cands) && i < k; i++ {
			out = append(out, Hit{DocID: cands[i].id, Score: cands[i].score, Snippet: cands[i].snip})
		}
		return out
	}
}

func TestRunEvaluationBasicPass(t *testing.T) {
	docs := map[string]string{
		"leave-travel-policy":  "员工年假申请流程与差旅报销标准",
		"travel-expense-policy": "差旅审批与报销规则",
		"payroll-schedule":      "薪资发放时间为每月15号",
		"performance-review":    "绩效考核按季度开展",
		"career-ladder":         "晋升通道与职级体系",
		"onboarding-policy":     "新员工试用期三个月",
		"benefits-overview":     "员工福利清单",
		"overtime-policy":       "加班调休规则",
	}
	corpus := corpusStub(docs)
	gold := []GoldItem{
		{Query: "年假怎么请", RelevantDocIDs: []string{"leave-travel-policy"}},
		{Query: "请假流程", RelevantDocIDs: []string{"leave-travel-policy"}},
		{Query: "差旅报销标准", RelevantDocIDs: []string{"travel-expense-policy"}},
		{Query: "薪资发放时间", RelevantDocIDs: []string{"payroll-schedule"}},
		{Query: "晋升通道", RelevantDocIDs: []string{"career-ladder"}},
	}
	rep, err := RunEvaluation(corpus, gold, Options{Ks: []int{5, 10}})
	if err != nil {
		t.Fatalf("eval: %v", err)
	}
	if rep.SampleSize != len(gold) {
		t.Fatalf("sample size = %d want %d", rep.SampleSize, len(gold))
	}
	if rep.RecallAt10 < 0.7 {
		t.Fatalf("recall@10 = %v, expected ≥ 0.7", rep.RecallAt10)
	}
	if rep.RecallAt5 < 0.7 {
		t.Fatalf("recall@5 = %v, expected ≥ 0.7", rep.RecallAt5)
	}
	if rep.MRR <= 0 {
		t.Fatalf("MRR must be > 0, got %v", rep.MRR)
	}
	if rep.NDCGAt10 <= 0 {
		t.Fatalf("nDCG@10 must be > 0, got %v", rep.NDCGAt10)
	}
	if rep.HallucinationRate > 0.3 {
		t.Fatalf("hallucination rate too high: %v", rep.HallucinationRate)
	}
	if rep.Status == "failed" {
		t.Fatalf("expected non-failed status, got %+v", rep)
	}
}

func TestRunEvaluationEmptyGoldRejected(t *testing.T) {
	corpus := corpusStub(map[string]string{"a": "anything"})
	_, err := RunEvaluation(corpus, nil, Options{})
	if err == nil {
		t.Fatal("expected error on empty gold set")
	}
}

func TestRunEvaluationFailsOnUnrelatedCorpus(t *testing.T) {
	docs := map[string]string{
		"cooking-recipes": "红烧肉做法",
		"weather-info":    "今日天气晴",
	}
	corpus := corpusStub(docs)
	gold := []GoldItem{
		{Query: "年假怎么请", RelevantDocIDs: []string{"leave-travel-policy"}},
		{Query: "薪资发放时间", RelevantDocIDs: []string{"payroll-schedule"}},
	}
	rep, err := RunEvaluation(corpus, gold, Options{Ks: []int{5, 10}})
	if err != nil {
		t.Fatalf("eval: %v", err)
	}
	if rep.Status != "failed" {
		t.Fatalf("expected failed status, got %+v", rep)
	}
	if len(rep.FailReasons) == 0 {
		t.Fatalf("expected fail reasons, got none")
	}
}

func TestRecallAtKExactComputation(t *testing.T) {
	hits := []Hit{
		{DocID: "a"}, {DocID: "b"}, {DocID: "c"}, {DocID: "d"},
	}
	gold := map[string]bool{"a": true, "b": true, "x": true}
	// 2 of 3 gold items appear in top-2 → 2/3
	got := recallAtK(hits, gold, nil, false, 2)
	if got < 0.66 || got > 0.67 {
		t.Fatalf("recall@2 want ~0.667 (a+b of 3 gold), got %v", got)
	}
}

func TestMRRFirstHit(t *testing.T) {
	hits := []Hit{{DocID: "x"}, {DocID: "a"}, {DocID: "b"}}
	gold := map[string]bool{"a": true}
	if rr := reciprocalRank(hits, gold, nil, false); rr != 0.5 {
		t.Fatalf("rr want 0.5, got %v", rr)
	}
}

func TestNDCGAt10Perfect(t *testing.T) {
	hits := make([]Hit, 10)
	for i := range hits {
		hits[i] = Hit{DocID: "g"}
	}
	gold := map[string]bool{"g": true}
	ndcg := ndcgAt10(hits, gold, nil, false)
	if ndcg < 0.999 {
		t.Fatalf("perfect ndcg expected ~1.0, got %v", ndcg)
	}
}

func TestNDCGAt10Zero(t *testing.T) {
	hits := []Hit{{DocID: "a"}, {DocID: "b"}}
	gold := map[string]bool{"x": true}
	if ndcg := ndcgAt10(hits, gold, nil, false); ndcg != 0 {
		t.Fatalf("expected 0, got %v", ndcg)
	}
}

func TestHallucinationDetection(t *testing.T) {
	docs := map[string]string{
		"leave-travel-policy":  "员工 年假 申请 流程",
		"random-blog":          "员工 周末 去 钓鱼 活动",
		"another-random":       "员工 今天 看了 部 电影 影评",
		"performance-review":   "员工 绩效 考核 周期 制度",
	}
	corpus := corpusStub(docs)
	gold := []GoldItem{
		{Query: "员工 年假 申请", RelevantDocIDs: []string{"leave-travel-policy"}},
	}
	rep, err := RunEvaluation(corpus, gold, Options{Ks: []int{5, 10}})
	if err != nil {
		t.Fatalf("eval: %v", err)
	}
	// Four docs match the "员工" bigram but only leave-travel-policy is gold.
	if rep.HallucinationRate <= 0 {
		t.Fatalf("hallucination rate must be > 0 when irrelevant docs appear, got %v", rep.HallucinationRate)
	}
	if len(rep.HallucinatedHits) == 0 {
		t.Fatalf("expected at least one hallucinated hit flagged")
	}
}

func TestSortHitsByScore(t *testing.T) {
	in := []Hit{{DocID: "a", Score: 1.0}, {DocID: "b", Score: 3.0}, {DocID: "c", Score: 2.0}}
	out := SortHitsByScore(in)
	if out[0].DocID != "b" || out[1].DocID != "c" || out[2].DocID != "a" {
		t.Fatalf("sort order wrong: %+v", out)
	}
}

func TestDefaultGoldSetNonEmpty(t *testing.T) {
	if len(DefaultGoldSet) < 10 {
		t.Fatalf("default gold set must have ≥10 queries, got %d", len(DefaultGoldSet))
	}
	for i, g := range DefaultGoldSet {
		if strings.TrimSpace(g.Query) == "" {
			t.Fatalf("gold[%d] empty query", i)
		}
		if len(g.RelevantDocIDs) == 0 {
			t.Fatalf("gold[%d] no relevant docs", i)
		}
	}
}

func TestRulesPassThreshold(t *testing.T) {
	p := PassRules{}.normalized()
	if p.MinRecallAt10 != 0.70 {
		t.Fatalf("default MinRecallAt10 = %v, want 0.70", p.MinRecallAt10)
	}
	if p.MaxHallucination != 0.15 {
		t.Fatalf("default MaxHallucination = %v, want 0.15", p.MaxHallucination)
	}
}
