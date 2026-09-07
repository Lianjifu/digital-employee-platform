package memory

import (
	"testing"
)

func doc(id, layer, body string) Doc {
	return Doc{ID: id, Title: id, Content: body, Layer: layer}
}

func TestScoreEmptyCorpus(t *testing.T) {
	if got := Score(nil, Query{Text: "x"}); got != nil {
		t.Fatalf("empty corpus: got %v", got)
	}
}

func TestScoreEmptyQuery(t *testing.T) {
	corpus := []Doc{doc("a", "long_term", "anything")}
	if got := Score(corpus, Query{Text: ""}); got != nil {
		t.Fatalf("empty query: got %v", got)
	}
}

func TestScoreRanksRelevantFirst(t *testing.T) {
	corpus := []Doc{
		doc("a", "long_term", "年假 申请 流程 与 差旅 报销 标准"),
		doc("b", "long_term", "员工 福利 清单"),
		doc("c", "long_term", "技术 架构 与 服务 部署"),
	}
	got := Score(corpus, Query{Text: "年假 申请", TopK: 3, FetchK: 10})
	if len(got) < 1 {
		t.Fatal("expected hits")
	}
	if got[0].ID != "a" {
		t.Fatalf("rank: top must be a, got %s", got[0].ID)
	}
}

func TestScoreBM25OutranksSubstring(t *testing.T) {
	// Doc A contains the term 5 times. Doc B contains it once + 4 distractor terms.
	corpus := []Doc{
		doc("a", "long_term", "年假 年假 年假 年假 年假"),
		doc("b", "long_term", "薪资 报销 流程 制度 年假"),
	}
	got := Score(corpus, Query{Text: "年假", TopK: 1, FetchK: 5})
	if got[0].ID != "a" {
		t.Fatalf("BM25 should rank repeated-term doc first: got %s", got[0].ID)
	}
}

func TestScoreLayerPrior(t *testing.T) {
	corpus := []Doc{
		doc("short", "short_term", "年假 申请 流程"),
		doc("long", "long_term", "年假 申请 流程"),
	}
	got := Score(corpus, Query{Text: "年假", TopK: 2, FetchK: 5})
	if got[0].Layer != "long_term" {
		t.Fatalf("long_term should outrank short_term on tie, got %s", got[0].Layer)
	}
}

func TestScoreMMRDiversifies(t *testing.T) {
	corpus := []Doc{
		doc("a", "long_term", "年假 申请 流程 与 差旅 报销"),
		doc("a1", "long_term", "年假 申请 流程 与 差旅 报销"),
		doc("a2", "long_term", "年假 申请 流程 与 差旅 报销"),
		doc("b", "long_term", "薪资 发放 时间"),
	}
	got := Score(corpus, Query{Text: "年假", TopK: 2, FetchK: 10, Lambda: 0.5})
	if len(got) != 2 {
		t.Fatalf("len=%d", len(got))
	}
	// With low λ, MMR should pick the dissimilar doc.
	if got[0].ID != "a" && got[1].ID == "a" {
		// both top-2 are 'a' family — diversity failed
		t.Errorf("MMR did not diversify: %+v", got)
	}
}

func TestScoreTopKLimit(t *testing.T) {
	corpus := []Doc{
		doc("a", "long_term", "年假 申请"),
		doc("b", "long_term", "年假 申请"),
		doc("c", "long_term", "年假 申请"),
		doc("d", "long_term", "年假 申请"),
	}
	got := Score(corpus, Query{Text: "年假", TopK: 2, FetchK: 10})
	if len(got) != 2 {
		t.Fatalf("TopK=2 but len=%d", len(got))
	}
}

func TestScoreCJKBigrams(t *testing.T) {
	corpus := []Doc{
		doc("a", "long_term", "员工 年假 申请 流程 制度 文档"),
		doc("b", "long_term", "技术 架构 部署 流程"),
	}
	got := Score(corpus, Query{Text: "年假", TopK: 1})
	if got[0].ID != "a" {
		t.Fatalf("CJK bigrams must match: got %s", got[0].ID)
	}
}

func TestLayerBoost(t *testing.T) {
	if layerBoost("long_term") <= layerBoost("working") {
		t.Fatal("long_term must boost more than working")
	}
	if layerBoost("working") <= layerBoost("short_term") {
		t.Fatal("working must boost more than short_term")
	}
}

func TestAvgDocLen(t *testing.T) {
	if avg := avgDocLen([]Doc{
		doc("a", "long_term", "hello world"),
		doc("b", "long_term", "good morning world"),
	}); avg != 2.5 {
		t.Fatalf("avg=%v want 2.5", avg)
	}
}

func TestTokenHitRatio(t *testing.T) {
	r := tokenHitRatio("hello world", []string{"hello", "missing"})
	if r != 0.5 {
		t.Fatalf("ratio=%v want 0.5", r)
	}
}

func TestDocumentFrequency(t *testing.T) {
	corpus := []Doc{
		doc("a", "long_term", "年假 申请"),
		doc("b", "long_term", "年假 流程"),
		doc("c", "long_term", "薪资 制度"),
	}
	df := documentFrequency(corpus, []string{"年假", "薪资", "流程"})
	if df["年假"] != 2 || df["薪资"] != 1 || df["流程"] != 1 {
		t.Fatalf("df: %+v", df)
	}
}

func TestJaccardSymmetric(t *testing.T) {
	a := Doc{Content: "hello world"}
	b := Doc{Content: "world peace"}
	if j := jaccard(a, b); j <= 0 {
		t.Fatalf("jaccard must be > 0, got %v", j)
	}
	if j := jaccard(a, a); j != 1 {
		t.Fatalf("self-jaccard must be 1, got %v", j)
	}
}
