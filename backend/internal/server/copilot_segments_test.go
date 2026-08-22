package server

import (
	"testing"

	"github.com/digital-employee-platform/backend/internal/store"
)

func TestSplitAssistantSegmentsDelimiter(t *testing.T) {
	text := "我先确认一下。\n---\n这是正文。\n---\n这是结论。"
	segs := splitAssistantSegments(text, segmentSplitConfig{MinRunes: 10, MaxSegments: 5})
	if len(segs) != 3 {
		t.Fatalf("expected 3 segments, got %d: %#v", len(segs), segs)
	}
}

func TestBuildSegmentsFromTurnSingle(t *testing.T) {
	segs := buildSegmentsFromTurn("hello", reactTurnResult{}, replyModeSingle, "m1", func() string { return "x" }, nil)
	if len(segs) != 1 || segs[0].ID != "m1" {
		t.Fatalf("single segment: %#v", segs)
	}
}

func TestBuildSegmentsFromTurnSegmented(t *testing.T) {
	text := "段一内容足够长，超过四十个字以便触发分段逻辑。\n---\n段二也有足够长的内容，同样超过四十个字。"
	segs := buildSegmentsFromTurn(text, reactTurnResult{}, replyModeSegmented, "m1", func() string { return "x" }, nil)
	if len(segs) < 2 {
		t.Fatalf("expected >=2 segments, got %#v", segs)
	}
	if segs[0].ID != "m1" {
		t.Fatalf("first segment should reuse firstMessageID, got %s", segs[0].ID)
	}
}

func TestMergeStoredAssistantTurns(t *testing.T) {
	stored := []map[string]any{
		{"role": "user", "content": "hi", "correlationId": "c1"},
		{"role": "assistant", "content": "a", "correlationId": "c1"},
		{"role": "assistant", "content": "b", "correlationId": "c1"},
	}
	merged := mergeStoredAssistantTurns(stored)
	if len(merged) != 2 {
		t.Fatalf("expected 2 after merge, got %d", len(merged))
	}
	if str(merged[1]["content"]) != "a\n\nb" {
		t.Fatalf("merged content: %s", merged[1]["content"])
	}
}

func TestModelIDFromStoredMessage(t *testing.T) {
	if got := modelIDFromStoredMessage(map[string]any{"metrics": map[string]any{"model": "sonnet-4"}}); got != "sonnet-4" {
		t.Fatalf("got %q", got)
	}
}

func TestAssistantMessagesFromSegmentsIndexOffset(t *testing.T) {
	segs := []AssistantSegment{{ID: "m2", Content: "body"}}
	msgs := assistantMessagesFromSegments(segs, "corr", replyModeSegmented, "now", nil, false, nil, nil, 1)
	if len(msgs) != 1 {
		t.Fatalf("len=%d", len(msgs))
	}
	if intFrom(msgs[0]["segmentIndex"]) != 1 {
		t.Fatalf("segmentIndex=%v", msgs[0]["segmentIndex"])
	}
}

func TestRememberIdempotentTurnMultiMessage(t *testing.T) {
	s := &Server{Store: store.New()}
	msgs := []map[string]any{
		{"id": "a1", "role": "assistant", "content": "one", "correlationId": "c1", "segmentIndex": 0},
		{"id": "a2", "role": "assistant", "content": "two", "correlationId": "c1", "segmentIndex": 1},
	}
	rememberIdempotentTurn(s, "conv", "client-1", msgs)
	got := s.loadIdempotentTurn("conv", "client-1")
	if len(got) != 2 {
		t.Fatalf("want 2 messages, got %d", len(got))
	}
}

func TestResolveReplyModeOfficeEmployee(t *testing.T) {
	emp := map[string]any{"runtime": map[string]any{"replyMode": "segmented"}}
	if got := resolveReplyMode(nil, emp); got != replyModeSegmented {
		t.Fatalf("got %s", got)
	}
	if got := resolveReplyMode(map[string]any{"replyMode": "stepwise"}, emp); got != replyModeStepwise {
		t.Fatalf("body override got %s", got)
	}
}
