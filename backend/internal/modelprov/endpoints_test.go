package modelprov

import "testing"

func TestJoinModelsURLAndCandidates(t *testing.T) {
	if got := JoinModelsURL("openai_compatible", "https://api.deepseek.com", ""); got != "https://api.deepseek.com/v1/models" {
		t.Fatalf("deepseek root: %s", got)
	}
	if got := JoinModelsURL("openai_compatible", "https://api.deepseek.com/v1", ""); got != "https://api.deepseek.com/v1/models" {
		t.Fatalf("deepseek v1: %s", got)
	}
	cands := DiscoverCandidates("anthropic", "https://api.deepseek.com/anthropic", "")
	foundRoot := false
	for _, c := range cands {
		if c == "https://api.deepseek.com/v1/models" || c == "https://api.deepseek.com/models" {
			foundRoot = true
		}
	}
	if !foundRoot {
		t.Fatalf("expected deepseek root models candidate, got %#v", cands)
	}
}

func TestInferProtocolFromURL(t *testing.T) {
	if InferProtocolFromURL("https://api.deepseek.com/v1") != "openai_compatible" {
		t.Fatal("deepseek")
	}
	if InferProtocolFromURL("https://api.anthropic.com") != "anthropic" {
		t.Fatal("anthropic")
	}
}
