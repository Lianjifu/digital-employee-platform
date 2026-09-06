package server

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	reNextRunCommand = regexp.MustCompile(`(?m)下一步可用\s+action=run\s+command=(\S+)`)
	reSkillWritePath = regexp.MustCompile(`(?m)【skill\.write】已写入\s+(\S+)`)
)

// buildSkillTurnPlan expands a skill tool call into an approvable multi-step plan (write → run).
func buildSkillTurnPlan(tool *registeredTool, call toolCallRequest) map[string]any {
	if tool == nil || tool.Kind != "skill" {
		return nil
	}
	args := call.Args
	if args == nil {
		args = map[string]any{}
	}
	// userMessage: prefer the one passed via hidden args key (set by request handlers when
	// the surrounding conversation context is available); fall back to any caller-supplied
	// user-content field so the outline inference has intent to anchor on.
	userMessage := strings.TrimSpace(coalesce(
		str(args["_userMessage"]),
		coalesce(str(args["input"]), coalesce(str(args["content"]), str(args["outline"]))),
	))
	action := normalizeSkillAction(args)
	cmd := skillCommandFromArgs(args)
	if action == "" {
		if looksLikeSkillScriptCommand(cmd) {
			action = skillActionRun
		} else if str(args["path"]) != "" || str(args["filename"]) != "" || str(args["content"]) != "" {
			action = skillActionWrite
		} else {
			action = skillActionRun
		}
	}

	steps := make([]map[string]any, 0, 2)
	switch action {
	case skillActionWrite:
		writeArgs := cloneArgs(args)
		writeArgs["action"] = skillActionWrite
		steps = append(steps, map[string]any{
			"id": "write", "action": skillActionWrite, "title": "写入技能工作区脚本",
			"args": writeArgs, "status": "pending",
		})
		runCmd := skillWritePathFromArgs(writeArgs)
		if runCmd != "" {
			steps = append(steps, map[string]any{
				"id": "run", "action": skillActionRun, "title": "执行脚本生成产物",
				"args":   map[string]any{"action": skillActionRun, "command": runCmd},
				"status": "pending",
			})
		}
	case skillActionRun:
		runArgs := cloneArgs(args)
		runArgs["action"] = skillActionRun
		if cmd != "" {
			runArgs["command"] = cmd
		}
		steps = append(steps, map[string]any{
			"id": "run", "action": skillActionRun, "title": "执行技能脚本/入口",
			"args": runArgs, "status": "pending",
		})
		steps = injectWriteStepsForRunDependencies(steps, args, cmd, userMessage, tool)
	default:
		stepArgs := cloneArgs(args)
		stepArgs["action"] = action
		steps = append(steps, map[string]any{
			"id": action, "action": action, "title": "技能步骤 · " + action,
			"args": stepArgs, "status": "pending",
		})
	}
	if len(steps) == 0 {
		return nil
	}
	titles := make([]string, 0, len(steps))
	for _, st := range steps {
		titles = append(titles, coalesce(str(st["title"]), str(st["action"])))
	}
	return map[string]any{
		"version": 1,
		"summary": strings.Join(titles, " → "),
		"steps":   steps,
	}
}

func cloneArgs(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		out[k] = v
	}
	return out
}

func skillWritePathFromArgs(args map[string]any) string {
	rel := strings.TrimSpace(str(args["path"]))
	if rel == "" {
		rel = strings.TrimSpace(str(args["filename"]))
	}
	if rel == "" {
		return ""
	}
	rel = strings.TrimPrefix(filepathToSlash(rel), "/")
	if strings.Contains(rel, "..") {
		return ""
	}
	if !strings.HasPrefix(rel, ".copilot-ws/") {
		rel = ".copilot-ws/" + strings.TrimPrefix(rel, "./")
	}
	return rel
}

func filepathToSlash(p string) string {
	return strings.ReplaceAll(p, "\\", "/")
}

func parseNextRunCommand(output string) string {
	if m := reNextRunCommand.FindStringSubmatch(output); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	if m := reSkillWritePath.FindStringSubmatch(output); len(m) == 2 {
		path := strings.TrimSpace(m[1])
		if strings.HasPrefix(path, ".copilot-ws/") || strings.HasPrefix(path, "scripts/") {
			return path
		}
	}
	return ""
}

func skillTurnSteps(plan map[string]any) []map[string]any {
	if plan == nil {
		return nil
	}
	return asMapSlice(plan["steps"])
}

func markSkillTurnStep(plan map[string]any, stepID, status, output string) {
	steps := skillTurnSteps(plan)
	for i, st := range steps {
		if str(st["id"]) != stepID && str(st["action"]) != stepID {
			continue
		}
		st["status"] = status
		if output != "" {
			st["output"] = truncateRunes(output, 1500)
		}
		st["finishedAt"] = time.Now().UTC().Format(time.RFC3339)
		steps[i] = st
		break
	}
	plan["steps"] = steps
}

func nextPendingSkillTurnStep(plan map[string]any) map[string]any {
	for _, st := range skillTurnSteps(plan) {
		status := str(st["status"])
		if status == "" || status == "pending" || status == "ready" {
			return st
		}
	}
	return nil
}

// skillTurnRunCommand returns the run step command from an approvable skill turn plan.
func skillTurnRunCommand(plan map[string]any) string {
	for _, st := range skillTurnSteps(plan) {
		if str(st["action"]) != skillActionRun {
			continue
		}
		args, _ := st["args"].(map[string]any)
		if cmd := skillCommandFromArgs(args); cmd != "" {
			return cmd
		}
	}
	return ""
}

// resetFailedRunStepsForContinue marks failed run steps pending so continueRun can retry them.
func resetFailedRunStepsForContinue(plan map[string]any) {
	steps := skillTurnSteps(plan)
	for i, st := range steps {
		if str(st["action"]) != skillActionRun {
			continue
		}
		status := str(st["status"])
		if status != "failed" && status != "needs_instruction" {
			continue
		}
		st["status"] = "pending"
		delete(st, "finishedAt")
		steps[i] = st
	}
	plan["steps"] = steps
}

func skillTurnHasRetryableRun(plan map[string]any) bool {
	for _, st := range skillTurnSteps(plan) {
		if str(st["action"]) != skillActionRun {
			continue
		}
		status := str(st["status"])
		if status == "failed" || status == "needs_instruction" {
			return true
		}
	}
	return false
}

// preferredNextRunCommand picks the script command to continue a skill turn (not outline/data files).
func preferredNextRunCommand(plan map[string]any, action map[string]any, fallbackOutput string) string {
	if plan != nil {
		if cmd := skillTurnRunCommand(plan); cmd != "" {
			return cmd
		}
	}
	if cmd := strings.TrimSpace(str(action["nextRunCommand"])); cmd != "" {
		return cmd
	}
	if cmd := parseNextRunCommand(fallbackOutput); cmd != "" && looksLikeSkillScriptCommand(cmd) {
		return cmd
	}
	return ""
}

func skillTurnHasPending(plan map[string]any) bool {
	return nextPendingSkillTurnStep(plan) != nil
}

func formatSkillTurnProgress(plan map[string]any) string {
	if plan == nil {
		return ""
	}
	var b strings.Builder
	b.WriteString("【Skill Turn】" + coalesce(str(plan["summary"]), "技能回合") + "\n")
	for i, st := range skillTurnSteps(plan) {
		b.WriteString(fmt.Sprintf("%d. %s · %s\n", i+1, coalesce(str(st["title"]), str(st["action"])), coalesce(str(st["status"]), "pending")))
		if out := str(st["output"]); out != "" {
			b.WriteString(truncateRunes(out, 800))
			b.WriteString("\n")
		}
	}
	return strings.TrimSpace(b.String())
}

func ensureSkillTurnHasRunStep(plan map[string]any, runCmd string) {
	if plan == nil || runCmd == "" {
		return
	}
	for _, st := range skillTurnSteps(plan) {
		if str(st["action"]) != skillActionRun {
			continue
		}
		args, _ := st["args"].(map[string]any)
		if args == nil {
			args = map[string]any{}
		}
		if str(args["command"]) == "" {
			args["command"] = runCmd
			args["action"] = skillActionRun
			st["args"] = args
		}
		return
	}
	steps := skillTurnSteps(plan)
	steps = append(steps, map[string]any{
		"id": "run", "action": skillActionRun, "title": "执行脚本生成产物",
		"args":   map[string]any{"action": skillActionRun, "command": runCmd},
		"status": "pending",
	})
	plan["steps"] = steps
	sum := str(plan["summary"])
	if sum != "" && !strings.Contains(sum, "执行脚本") {
		plan["summary"] = sum + " → 执行脚本生成产物"
	}
}

func isSkillWorkspaceWriteCall(call toolCallRequest, tool *registeredTool) bool {
	if tool == nil {
		return false
	}
	name := strings.ToLower(strings.TrimSpace(tool.Name))
	switch name {
	case "write_file", "edit_file":
		path := filepathToSlash(coalesce(str(call.Args["path"]), str(call.Args["file"])))
		return strings.Contains(path, ".copilot-ws/")
	case "pptx", "pdf", "spreadsheets", "xlsx":
		return tool.Kind == "skill" && normalizeSkillAction(call.Args) == skillActionWrite
	default:
		if tool.Kind != "skill" || normalizeSkillAction(call.Args) != skillActionWrite {
			return false
		}
		path := skillWritePathFromArgs(call.Args)
		return path != "" && (strings.HasPrefix(path, ".copilot-ws/") || strings.HasPrefix(path, "scripts/"))
	}
}

func shouldAutoRunAfterSkillWrite(res toolExecResult, runCmd string) bool {
	if res.Status != "success" {
		return false
	}
	runCmd = strings.TrimSpace(runCmd)
	if runCmd == "" {
		return false
	}
	if looksLikeSkillScriptCommand(runCmd) {
		return strings.Contains(runCmd, ".copilot-ws/") || strings.Contains(runCmd, "scripts/")
	}
	if !strings.HasPrefix(runCmd, ".copilot-ws/") && !strings.HasPrefix(runCmd, "scripts/") {
		return false
	}
	low := strings.ToLower(runCmd)
	return strings.HasSuffix(low, ".js") || strings.HasSuffix(low, ".mjs") ||
		strings.HasSuffix(low, ".ts") || strings.HasSuffix(low, ".py") || strings.HasSuffix(low, ".sh")
}

func buildAutoRunToolCallAfterWrite(reg []registeredTool, tool *registeredTool, writeCall toolCallRequest, runCmd string) toolCallRequest {
	runCmd = strings.TrimSpace(runCmd)
	args := map[string]any{"action": skillActionRun, "command": runCmd}
	if skillID := strings.TrimSpace(str(writeCall.Args["skillId"])); skillID != "" {
		args["skillId"] = skillID
	}
	if tool != nil && tool.Kind == "skill" {
		return toolCallRequest{Name: tool.Name, Args: args}
	}
	for i := range reg {
		t := &reg[i]
		if !t.Enabled || t.Kind != "skill" {
			continue
		}
		if officeSkillName(t.Name) {
			return toolCallRequest{Name: t.Name, Args: args}
		}
	}
	return toolCallRequest{Name: "bash", Args: map[string]any{"command": runCmd}}
}
