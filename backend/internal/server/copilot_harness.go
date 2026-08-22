package server

import (
	"context"
)

// runHarnessTurn routes to direct / react / plan_exec / multi_agent,
// applies routing_policies model tier, optional reflection, then streams once.
func (s *Server) runHarnessTurn(ctx context.Context, in reactTurnInput) reactTurnResult {
	decision := classifyCopilotMode(in.UserMessage, in.ModeHint, in.ReflectHint)
	in.RouteReason = decision.Reason
	in.SkipRoute = false
	in.SkipStream = true

	// Dynamic routing: map difficulty → published routing_policies level → primaryModelId
	resolvedModel, policyID, usedLevel := s.resolveModelByPolicyLevel(in.WorkspaceID, in.ModelID, decision.PolicyLevel)
	if resolvedModel != "" {
		in.ModelID = resolvedModel
	}

	in.Emit("route", "harness", map[string]any{
		"mode": decision.Mode, "reason": decision.Reason,
		"enabledTools": enabledToolKeys(in.Registry), "modelId": in.ModelID,
		"maxSteps":    reactMaxSteps,
		"policyLevel": usedLevel, "policyId": policyID,
		"requestedLevel": decision.PolicyLevel,
	})
	in.SkipRoute = true

	idGen := defaultSegmentIDGen(s)
	live := newLiveAnswerStream(in.Emit, in.ReplyMode, in.SegmentPolicy, in.CorrelationID, in.FirstMessageID, in.ModelID, idGen)
	in.LiveStream = live

	var out reactTurnResult
	switch decision.Mode {
	case modeMultiAgent:
		out = s.runMultiAgentTurn(ctx, in)
	case modePlanExec:
		out = s.runPlanExecuteTurn(ctx, in)
	case modeDirect:
		in.MaxSteps = 1
		out = s.runReactTurn(ctx, in)
		out.Mode = modeDirect
	default:
		out = s.runReactTurn(ctx, in)
		if out.Mode == "" {
			out.Mode = modeReact
		}
	}

	if out.Err != nil {
		return out
	}

	out = s.applyReflection(ctx, in, out, in.ReflectHint)
	if out.Mode == "" {
		out.Mode = decision.Mode
	}
	out.PolicyLevel = usedLevel
	out.PolicyID = policyID

	streamOpts := &streamAnswerOpts{
		ReplyMode: in.ReplyMode, SegmentPolicy: in.SegmentPolicy, CorrelationID: in.CorrelationID,
		FirstMessageID: in.FirstMessageID, IDGen: idGen,
		PreSegments: append(stepSegmentsSlice(in.StepSegments), out.StepSegments...),
		LiveStream: live,
	}
	out.Segments = streamHarnessAnswer(in.Emit, out.Text, coalesce(out.ModelID, in.ModelID), out.Resolved, out.Mode, out.Steps, streamOpts)
	out.ReplyMode = in.ReplyMode
	return out
}
