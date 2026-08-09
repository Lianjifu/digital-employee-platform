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
