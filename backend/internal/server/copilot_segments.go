package server

import (
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/pkg/contract"
)

const (
	replyModeSingle    = "single"
	replyModeSegmented = "segmented"
	replyModeStepwise  = "stepwise"

	segmentKindAck     = "ack"
	segmentKindBody    = "body"
	segmentKindSummary = "summary"
	segmentKindStep    = "step"
)

type AssistantSegment struct {
	ID        string
	Index     int
	Kind      string
	Title     string
	Content   string
	ToolCalls []map[string]any
	Citations []map[string]any
}

type segmentSplitConfig struct {
	MinRunes    int
	MaxSegments int
}

type streamAnswerOpts struct {
	ReplyMode      string
	CorrelationID  string
	FirstMessageID string
	IDGen          func() string
	PreSegments    []AssistantSegment
}

func normalizeReplyMode(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case replyModeSegmented, replyModeStepwise:
		return strings.ToLower(strings.TrimSpace(v))
	default:
		return replyModeSingle
	}
}

func resolveReplyMode(body map[string]any, emp map[string]any) string {
	if body != nil {
		if m := normalizeReplyMode(str(body["replyMode"])); m != replyModeSingle {
			return m
		}
	}
	if env := strings.ToLower(strings.TrimSpace(lookupEnv("DE_COPILOT_REPLY_MODE"))); env == replyModeSegmented || env == replyModeStepwise {
		return env
	}
	if strings.ToLower(strings.TrimSpace(lookupEnv("DE_COPILOT_REPLY_MODE"))) == replyModeSingle {
		return replyModeSingle
	}
	if emp != nil {
		if rt, ok := emp["runtime"].(map[string]any); ok {
			if m := normalizeReplyMode(str(rt["replyMode"])); m != replyModeSingle {
				return m
			}
		}
	}
	return replyModeSingle
}

func segmentAckEnabled() bool {
	return envFlagTrue("DE_COPILOT_SEGMENT_ACK")
}

func defaultSegmentIDGen(s *Server) func() string {
	if s != nil && s.Store != nil {
		return func() string { return s.Store.ID("msg") }
	}
	return func() string { return "msg_" + time.Now().UTC().Format("150405.000000") }
}

func splitAssistantSegments(text string, cfg segmentSplitConfig) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if cfg.MinRunes <= 0 {
		cfg.MinRunes = 40
	}
	if cfg.MaxSegments <= 0 {
		cfg.MaxSegments = 5
	}
	parts := strings.Split(text, "\n---\n")
	explicitDelimiter := len(parts) > 1
	if !explicitDelimiter {
		parts = strings.Split(text, "\n\n")
	}
	merged := make([]string, 0, len(parts))
	var buf strings.Builder
	flush := func() {
		if buf.Len() == 0 {
			return
		}
		merged = append(merged, strings.TrimSpace(buf.String()))
		buf.Reset()
	}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if explicitDelimiter {
			merged = append(merged, p)
			continue
		}
		if buf.Len() == 0 {
			buf.WriteString(p)
			continue
		}
		if len([]rune(buf.String())) < cfg.MinRunes {
			buf.WriteString("\n\n")
			buf.WriteString(p)
			continue
		}
		flush()
		buf.WriteString(p)
	}
	flush()
	if len(merged) <= 1 {
		return merged
	}
	if len(merged) > cfg.MaxSegments {
		head := merged[:cfg.MaxSegments-1]
		tail := strings.Join(merged[cfg.MaxSegments-1:], "\n\n")
		return append(head, tail)
	}
	return merged
}

func buildAckSegment(userMsg string, hasAttachments bool) (AssistantSegment, bool) {
	if !segmentAckEnabled() {
		return AssistantSegment{}, false
	}
	if !hasAttachments && len([]rune(strings.TrimSpace(userMsg))) < 80 {
		return AssistantSegment{}, false
	}
	text := "好的，我先看一下你的需求。"
	if hasAttachments {
		text = "收到，我先阅读附件并整理一下。"
	}
	return AssistantSegment{Kind: segmentKindAck, Title: "确认", Content: text}, true
}

func appendStepSegment(sink *[]AssistantSegment, idGen func() string, kind, title, content string) {
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	if sink == nil {
		return
	}
	*sink = append(*sink, AssistantSegment{
		ID:      idGen(),
		Index:   len(*sink),
		Kind:    coalesce(kind, segmentKindStep),
		Title:   title,
		Content: content,
	})
}

func buildSegmentsFromTurn(full string, reactOut reactTurnResult, replyMode, firstMessageID string, idGen func() string, pre []AssistantSegment) []AssistantSegment {
	replyMode = normalizeReplyMode(replyMode)
	if idGen == nil {
		idGen = func() string { return "msg_" + time.Now().UTC().Format("150405.000000") }
	}
	out := append([]AssistantSegment{}, pre...)
	assignIDs := func(segs []AssistantSegment) []AssistantSegment {
		for i := range segs {
			if segs[i].ID == "" {
				segs[i].ID = idGen()
			}
			segs[i].Index = len(out) + i
			if segs[i].Kind == "" {
				segs[i].Kind = segmentKindBody
			}
		}
		return segs
	}

	switch replyMode {
	case replyModeStepwise:
		if len(reactOut.StepSegments) > 0 {
			out = append(out, reactOut.StepSegments...)
		}
		summary := strings.TrimSpace(full)
		if summary != "" {
			out = append(out, AssistantSegment{Kind: segmentKindSummary, Title: "结论", Content: summary})
		}
	case replyModeSegmented:
		chunks := splitAssistantSegments(full, segmentSplitConfig{})
		for i, c := range chunks {
			kind := segmentKindBody
			if i == 0 && len(out) == 0 {
				kind = segmentKindBody
			}
			if i == len(chunks)-1 && len(chunks) > 1 {
				kind = segmentKindSummary
			}
			out = append(out, AssistantSegment{Kind: kind, Content: c})
		}
	default:
		if strings.TrimSpace(full) == "" {
			return nil
		}
		return []AssistantSegment{{ID: coalesce(firstMessageID, idGen()), Index: 0, Kind: segmentKindBody, Content: full}}
	}

	if len(out) == 0 {
		if strings.TrimSpace(full) == "" {
			return nil
		}
		return []AssistantSegment{{ID: coalesce(firstMessageID, idGen()), Index: 0, Kind: segmentKindBody, Content: full}}
	}
	out = assignIDs(out)
	if firstMessageID != "" && len(out) > 0 {
		// 首段正文复用客户端 replyId（跳过 ack 段）
		for i := range out {
			if out[i].Kind != segmentKindAck {
				out[i].ID = firstMessageID
				break
			}
		}
	}
	for i := range out {
		out[i].Index = i
	}
	if len(out) == 1 {
		return out
	}
	return out
}

func emitSegmentStream(emit reactEmitFunc, segments []AssistantSegment, modelID, corr, replyMode string) {
	if emit == nil || len(segments) == 0 {
		return
	}
	emit("stage", "runtime", map[string]any{
		"status": "ok", "modelId": modelID, "replyMode": replyMode, "segmentCount": len(segments),
	})
	total := len(segments)
	for i, seg := range segments {
		emit(contract.StreamMessageStart, "runtime", map[string]any{
			"type": contract.StreamMessageStart, "messageId": seg.ID, "segmentIndex": i,
			"segmentTotal": total, "correlationId": corr, "replyMode": replyMode,
			"kind": seg.Kind, "title": seg.Title,
		})
		for _, c := range chunkText(seg.Content, 28) {
			emit(contract.StreamMessageDelta, "runtime", map[string]any{
				"type": contract.StreamMessageDelta, "messageId": seg.ID, "text": c, "modelId": modelID,
			})
			time.Sleep(4 * time.Millisecond)
		}
		emit(contract.StreamMessageDone, "runtime", map[string]any{
			"type": contract.StreamMessageDone, "messageId": seg.ID, "segmentIndex": i,
			"kind": seg.Kind, "title": seg.Title,
		})
	}
}

func streamHarnessAnswer(emit reactEmitFunc, finalText, modelID string, rt resolvedTurn, mode string, steps int, opts *streamAnswerOpts) []AssistantSegment {
	emit("stage", "runtime", map[string]any{
		"status": "ok", "modelId": coalesce(rt.ModelID, modelID),
		"providerId": rt.ProviderID, "source": coalesce(rt.Source, mode),
		"modelName": rt.ModelName, "mode": mode, "steps": steps,
	})
	replyMode := replyModeSingle
	var firstID string
	var idGen func() string
	var pre []AssistantSegment
	var corr string
	if opts != nil {
		replyMode = normalizeReplyMode(opts.ReplyMode)
		firstID = opts.FirstMessageID
		idGen = opts.IDGen
		pre = opts.PreSegments
		corr = opts.CorrelationID
	}
	segs := buildSegmentsFromTurn(finalText, reactTurnResult{}, replyMode, firstID, idGen, pre)
	if len(segs) <= 1 && replyMode == replyModeSingle {
		for _, c := range chunkText(finalText, 28) {
			emit("delta", "runtime", map[string]any{"text": c, "modelId": modelID})
			time.Sleep(4 * time.Millisecond)
		}
		if len(segs) == 1 {
			return segs
		}
		return []AssistantSegment{{ID: coalesce(firstID, ""), Kind: segmentKindBody, Content: finalText}}
	}
	if len(segs) <= 1 && replyMode != replyModeSingle {
		// 拆段失败，降级单气泡
		for _, c := range chunkText(finalText, 28) {
			emit("delta", "runtime", map[string]any{"text": c, "modelId": modelID})
			time.Sleep(4 * time.Millisecond)
		}
		return segs
	}
	emitSegmentStream(emit, segs, coalesce(rt.ModelID, modelID), corr, replyMode)
	return segs
}

func assistantMessagesFromSegments(segments []AssistantSegment, corr, replyMode, now string, shared map[string]any, attachLastMeta bool, toolCalls []map[string]any, citations []map[string]any, indexOffset int) []map[string]any {
	if len(segments) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(segments))
	for i, seg := range segments {
		msg := map[string]any{
			"id": seg.ID, "role": "assistant", "content": seg.Content,
			"createdAt": now, "correlationId": corr,
			"segmentIndex": indexOffset + i, "segmentKind": seg.Kind, "replyMode": replyMode,
		}
		if seg.Title != "" {
			msg["segmentTitle"] = seg.Title
		}
		for k, v := range shared {
			msg[k] = v
		}
		if len(seg.ToolCalls) > 0 {
			msg["toolCalls"] = seg.ToolCalls
		}
		if len(seg.Citations) > 0 {
			msg["citations"] = seg.Citations
		}
		if attachLastMeta && i == len(segments)-1 {
			if toolCalls != nil {
				msg["toolCalls"] = toolCalls
			}
			if len(citations) > 0 {
				msg["citations"] = citations
			}
		}
		out = append(out, msg)
	}
	return out
}

func segmentMessageIDs(segments []AssistantSegment) []string {
	ids := make([]string, 0, len(segments))
	for _, s := range segments {
		if s.ID != "" {
			ids = append(ids, s.ID)
		}
	}
	return ids
}

func segmentIDsFromMessages(msgs []map[string]any) []string {
	ids := make([]string, 0, len(msgs))
	for _, m := range msgs {
		if id := str(m["id"]); id != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func replayStoredSegments(emit reactEmitFunc, msgs []map[string]any, modelID, corr string) {
	if emit == nil || len(msgs) == 0 {
		return
	}
	segs := make([]AssistantSegment, 0, len(msgs))
	for i, m := range msgs {
		segs = append(segs, AssistantSegment{
			ID:      str(m["id"]),
			Index:   i,
			Kind:    coalesce(str(m["segmentKind"]), segmentKindBody),
			Title:   str(m["segmentTitle"]),
			Content: str(m["content"]),
		})
	}
	replyMode := coalesce(str(msgs[len(msgs)-1]["replyMode"]), replyModeSingle)
	emitSegmentStream(emit, segs, modelIDFromStoredMessage(msgs[len(msgs)-1]), corr, replyMode)
}

func modelIDFromStoredMessage(msg map[string]any) string {
	if msg == nil {
		return ""
	}
	if m := str(msg["modelId"]); m != "" {
		return m
	}
	if metrics, ok := msg["metrics"].(map[string]any); ok {
		return str(metrics["model"])
	}
	return ""
}

func mergeStoredAssistantTurns(stored []map[string]any) []map[string]any {
	if len(stored) == 0 {
		return stored
	}
	out := make([]map[string]any, 0, len(stored))
	for _, m := range stored {
		role := strings.ToLower(strings.TrimSpace(str(m["role"])))
		if role != "assistant" || len(out) == 0 {
			out = append(out, m)
			continue
		}
		prev := out[len(out)-1]
		if strings.ToLower(strings.TrimSpace(str(prev["role"]))) != "assistant" {
			out = append(out, m)
			continue
		}
		pc, nc := str(prev["correlationId"]), str(m["correlationId"])
		if pc == "" || pc != nc {
			out = append(out, m)
			continue
		}
		merged := map[string]any{}
		for k, v := range prev {
			merged[k] = v
		}
		prevContent := str(prev["content"])
		nextContent := str(m["content"])
		switch {
		case prevContent != "" && nextContent != "":
			merged["content"] = prevContent + "\n\n" + nextContent
		default:
			merged["content"] = coalesce(prevContent, nextContent)
		}
		out[len(out)-1] = merged
	}
	return out
}

func replyModePromptClause(replyMode string) string {
	switch normalizeReplyMode(replyMode) {
	case replyModeSegmented, replyModeStepwise:
		return "\n若需多次面向用户的短回复，请用单独一行的 --- 分隔各段；第一段可先简短确认已理解任务（不超过 2 句），再展开后续段。\n"
	default:
		return ""
	}
}

func stepSegmentsSlice(sink *[]AssistantSegment) []AssistantSegment {
	if sink == nil {
		return nil
	}
	return append([]AssistantSegment{}, *sink...)
}
