package server

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
)

const (
	skillActionOpen      = "open"
	skillActionRun       = "run"
	skillActionWrite     = "write"
	skillActionArtifacts = "artifacts"
)

var skillScriptCommandRe = regexp.MustCompile(
	`(?i)^(?:(?:python3?|node|bash|sh)\s+)?(?:\./)?((?:scripts|\.copilot-ws)/[A-Za-z0-9._/-]+\.(?:py|sh|js|mjs|ts))(?:\s+.*)?$`,
)

// normalizeSkillAction maps args.action; empty means "auto" (open vs run inference).
func normalizeSkillAction(args map[string]any) string {
	a := strings.ToLower(strings.TrimSpace(str(args["action"])))
	switch a {
	case "open", "read", "inspect", "describe":
		return skillActionOpen
	case "run", "execute", "exec":
		return skillActionRun
	case "write", "write_file", "put":
		return skillActionWrite
	case "artifacts", "list_artifacts", "list":
		return skillActionArtifacts
	default:
		return ""
	}
}

func looksLikeSkillScriptCommand(cmd string) bool {
	return skillScriptCommandRe.MatchString(strings.TrimSpace(cmd))
}

func skillCommandFromArgs(args map[string]any) string {
	return strings.TrimSpace(coalesce(str(args["command"]), str(args["script"])))
}

// enrichSkillMetadata fills entrypoints / readOnly / producesArtifacts when missing.
func enrichSkillMetadata(sk map[string]any) {
	if sk == nil {
		return
	}
	name := strings.ToLower(str(sk["name"]))
	if sk["producesArtifacts"] == nil {
		sk["producesArtifacts"] = strings.Contains(name, "docx") ||
			strings.Contains(name, "pptx") ||
			strings.Contains(name, "xlsx") ||
			strings.Contains(name, "ppt") ||
			strings.Contains(name, "excel") ||
			strings.Contains(name, "word") ||
			strings.Contains(name, "文档")
	}
	if sk["readOnly"] == nil {
		if boolFrom(sk["hasScripts"]) && !boolFrom(sk["producesArtifacts"]) {
			sk["readOnly"] = true
		} else {
			sk["readOnly"] = !boolFrom(sk["producesArtifacts"]) && !boolFrom(sk["hasScripts"])
		}
	}
	if sk["entrypoints"] == nil {
		scripts := decodeStringSlice(sk["scripts"])
		if len(scripts) > 0 {
			sk["entrypoints"] = scripts
		} else if isDocxSkillName(str(sk["name"])) {
			sk["entrypoints"] = []string{"__builtin_generate_docx"}
			sk["producesArtifacts"] = true
			sk["readOnly"] = false
		}
	}
}

func officeSkillName(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	return strings.Contains(n, "pptx") || strings.Contains(n, "xlsx") ||
		strings.Contains(n, "ppt") || strings.Contains(n, "excel") ||
		strings.Contains(n, "幻灯") || strings.Contains(n, "表格")
}

func skillInvocationNeedsApproval(sessionMode string, tool *registeredTool, sk map[string]any, call toolCallRequest) bool {
	if tool == nil || tool.Kind != "skill" {
		return false
	}
	action := normalizeSkillAction(call.Args)
	cmd := skillCommandFromArgs(call.Args)
	if action == "" {
		if looksLikeSkillScriptCommand(cmd) {
			action = skillActionRun
		} else if isDocxSkillName(tool.Name) && (str(call.Args["content"]) != "" || str(call.Args["title"]) != "" || str(call.Args["input"]) != "") {
			action = skillActionRun
		} else {
			action = skillActionOpen
		}
	}
	if action == skillActionOpen || action == skillActionArtifacts {
		return false
	}
	if normalizeSessionMode(sessionMode) != sessionModeExecute {
		return false
	}
	if tool.RequiresApproval || tool.Mode == toolModeApproval {
		return action == skillActionRun || action == skillActionWrite
	}
	if sk != nil {
		enrichSkillMetadata(sk)
	}
	if action == skillActionWrite {
		return true
	}
	if action == skillActionRun {
		cmd := skillCommandFromArgs(call.Args)
		docxBuiltin := isDocxSkillName(tool.Name) && !looksLikeSkillScriptCommand(cmd) &&
			(str(call.Args["content"]) != "" || str(call.Args["title"]) != "" || str(call.Args["input"]) != "" || str(call.Args["command"]) == "")
		if !looksLikeSkillScriptCommand(cmd) && !docxBuiltin {
			// Invalid run args → harness returns needs_instruction; do not open an approval card for gibberish.
			return false
		}
		if sk != nil && boolFrom(sk["readOnly"]) {
			return false
		}
		if sk != nil && boolFrom(sk["producesArtifacts"]) {
			return true
		}
		if isDocxSkillName(tool.Name) || officeSkillName(tool.Name) {
			return true
		}
	}
	return false
}

func denySkillWriteInInvestigate() toolExecResult {
	return toolExecResult{
		Status: "denied", Permission: "session_mode",
		Error:  "当前模式禁止技能写/执行产出，请切换到「执行」",
		Output: "当前为「问答」或「方案」模式：仅允许 skill action=open / artifacts。写文件或 run 产出请切换到「执行」并经人工审核。",
	}
}

func (s *Server) resolveSkillForTool(ws string, t *registeredTool, skillID string) map[string]any {
	sk := s.findWorkspaceSkill(ws, skillID, t.Name)
	if sk == nil && isDocxSkillName(t.Name) {
		s.Store.EnsureDocxSkillReady()
		sk = s.findWorkspaceSkill(ws, skillID, t.Name)
		if sk == nil {
			sk = s.findWorkspaceSkill("w1", "sk-docx", "docx")
		}
	}
	return sk
}

// runSkillTool implements the Skill Harness: open / write / run / artifacts.
func (s *Server) runSkillTool(ctx toolRunContext, t *registeredTool, call toolCallRequest, started time.Time) toolExecResult {
	ws := ctx.WorkspaceID
	skillID := coalesce(str(call.Args["skillId"]), "")
	action := normalizeSkillAction(call.Args)
	cmd := skillCommandFromArgs(call.Args)
	input := coalesce(str(call.Args["input"]), coalesce(str(call.Args["content"]), ctx.UserMessage))

	if action == "" {
		if looksLikeSkillScriptCommand(cmd) {
			action = skillActionRun
		} else if isDocxSkillName(t.Name) && (str(call.Args["content"]) != "" || str(call.Args["title"]) != "" || str(call.Args["input"]) != "") {
			action = skillActionRun
		} else {
			action = skillActionOpen
		}
	}

	if (action == skillActionRun || action == skillActionWrite) && normalizeSessionMode(ctx.SessionMode) == sessionModeInvestigate {
		return denySkillWriteInInvestigate()
	}

	sk := s.resolveSkillForTool(ws, t, skillID)
	if sk == nil {
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error:  "技能不存在：" + t.Name,
			Output: "未找到工作区内技能「" + t.Name + "」。请确认已装配并启用。",
		}
	}
	enrichSkillMetadata(sk)
	skillID = str(sk["id"])

	switch action {
	case skillActionOpen:
		return s.skillOpen(ctx, t, sk, started)
	case skillActionArtifacts:
		return s.skillListArtifacts(sk, started)
	case skillActionWrite:
		return s.skillWrite(sk, call, started)
	case skillActionRun:
		return s.skillRun(ctx, t, sk, call, input, started)
	default:
		return s.skillOpen(ctx, t, sk, started)
	}
}

func (s *Server) skillOpen(_ toolRunContext, t *registeredTool, sk map[string]any, started time.Time) toolExecResult {
	md := ""
	pkgPath := str(sk["packagePath"])
	if pkgPath != "" {
		mdPath := filepath.Join(pkgPath, coalesce(str(sk["skillMdPath"]), "SKILL.md"))
		if b, err := os.ReadFile(mdPath); err == nil {
			md = string(b)
		}
	}
	if md == "" {
		md = coalesce(str(sk["description"]), "（无 SKILL.md）")
	}
	scripts := decodeStringSlice(sk["scripts"])
	entries := decodeStringSlice(sk["entrypoints"])
	var b strings.Builder
	b.WriteString("【skill.open】" + str(sk["name"]) + " @" + coalesce(str(sk["version"]), "?") + "\n")
	b.WriteString("skillId=" + str(sk["id"]) + "\n")
	b.WriteString(fmt.Sprintf("readOnly=%v producesArtifacts=%v hasScripts=%v\n",
		boolFrom(sk["readOnly"]), boolFrom(sk["producesArtifacts"]), boolFrom(sk["hasScripts"])))
	if len(entries) > 0 {
		b.WriteString("entrypoints:\n")
		for _, e := range entries {
			b.WriteString("  - " + e + "\n")
		}
	}
	if len(scripts) > 0 {
		b.WriteString("scripts（action=run 的 command 必须匹配其一或 .copilot-ws/ 下已 write 的脚本）:\n")
		for _, sc := range scripts {
			b.WriteString("  - " + sc + "\n")
		}
	} else if isDocxSkillName(str(sk["name"])) {
		b.WriteString("builtin entry: action=run with args.title + args.content → 生成 .docx\n")
	} else {
		b.WriteString("本包无 scripts：不可 run；仅可阅读说明。\n")
	}
	b.WriteString("下一步：按 SKILL.md 选择脚本，输出 <<<TOOL>>> ")
	b.WriteString(`{"name":"` + t.Name + `","args":{"action":"run","command":"scripts/...."}}`)
	b.WriteString("；若需先写生成器：action=write path=.copilot-ws/gen.js content=...\n")
	b.WriteString("--- SKILL.md ---\n")
	b.WriteString(truncateRunes(md, 6000))
	return toolExecResult{
		Status: "success", DurationMs: int(time.Since(started).Milliseconds()),
		Output: b.String(), SandboxID: "skill-open:" + str(sk["id"]),
	}
}

func (s *Server) skillWrite(sk map[string]any, call toolCallRequest, started time.Time) toolExecResult {
	pkgPath := str(sk["packagePath"])
	if pkgPath == "" {
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error: "技能无 packagePath", Output: "无法 write：该技能未落盘技能包",
		}
	}
	rel := strings.TrimSpace(str(call.Args["path"]))
	if rel == "" {
		rel = strings.TrimSpace(str(call.Args["filename"]))
	}
	content := str(call.Args["content"])
	if content == "" {
		content = str(call.Args["input"])
	}
	if rel == "" || content == "" {
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error: "缺少 path/content", Output: "action=write 需要 args.path（如 .copilot-ws/gen.js）与 args.content",
		}
	}
	rel = filepath.ToSlash(rel)
	rel = strings.TrimPrefix(rel, "/")
	if strings.Contains(rel, "..") {
		return toolExecResult{Status: "denied", Permission: "path", Error: "非法路径", Output: "path 不可包含 .."}
	}
	if !strings.HasPrefix(rel, ".copilot-ws/") {
		rel = ".copilot-ws/" + strings.TrimPrefix(rel, "./")
	}
	target := filepath.Join(pkgPath, filepath.FromSlash(rel))
	if !strings.HasPrefix(target, pkgPath+string(os.PathSeparator)) {
		return toolExecResult{Status: "denied", Permission: "path", Error: "越界", Output: "path 越出包目录"}
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return toolExecResult{Status: "failed", Error: err.Error(), Output: "创建目录失败", DurationMs: int(time.Since(started).Milliseconds())}
	}
	if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
		return toolExecResult{Status: "failed", Error: err.Error(), Output: "写入失败", DurationMs: int(time.Since(started).Milliseconds())}
	}
	return toolExecResult{
		Status:     "success",
		DurationMs: int(time.Since(started).Milliseconds()),
		Output:     fmt.Sprintf("【skill.write】已写入 %s（%d bytes）\n下一步可用 action=run command=%s", rel, len(content), rel),
		SandboxID:  "skill-write:" + str(sk["id"]),
	}
}

func (s *Server) skillListArtifacts(sk map[string]any, started time.Time) toolExecResult {
	dir := skillArtifactDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return toolExecResult{
			Status: "success", DurationMs: int(time.Since(started).Milliseconds()),
			Output: "【skill.artifacts】暂无产物目录或为空",
		}
	}
	var lines []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		low := strings.ToLower(n)
		if !strings.HasSuffix(low, ".docx") && !strings.HasSuffix(low, ".pptx") &&
			!strings.HasSuffix(low, ".xlsx") && !strings.HasSuffix(low, ".pdf") &&
			!strings.HasSuffix(low, ".csv") && !strings.HasSuffix(low, ".zip") {
			continue
		}
		_ = sk
		lines = append(lines, fmt.Sprintf("- %s → /api/skill-artifacts/%s", n, n))
		if len(lines) >= 20 {
			break
		}
	}
	if len(lines) == 0 {
		return toolExecResult{
			Status: "success", DurationMs: int(time.Since(started).Milliseconds()),
			Output: "【skill.artifacts】未找到相关产物",
		}
	}
	return toolExecResult{
		Status: "success", DurationMs: int(time.Since(started).Milliseconds()),
		Output: "【skill.artifacts】\n" + strings.Join(lines, "\n"),
	}
}

func (s *Server) skillRun(ctx toolRunContext, t *registeredTool, sk map[string]any, call toolCallRequest, input string, started time.Time) toolExecResult {
	actor := "助手"
	if ctx.Viewer != nil && ctx.Viewer.Name != "" {
		actor = ctx.Viewer.Name
	}
	title := coalesce(str(call.Args["title"]), coalesce(str(call.Args["filename"]), t.Name))
	cmd := skillCommandFromArgs(call.Args)

	track := func(ms int, ok bool, source string) {
		s.recordSkillInvocationWithRequest(ctx.Request, ctx.WorkspaceID, sk, ms, ok, actor, source)
		if ctx.DigitalEmployee != "" {
			s.recordEmployeeRuntime(ctx.DigitalEmployee, ms, ok)
		}
	}

	// Builtin docx entrypoint (L5: stays as documented entry, not a pattern for other skills)
	if isDocxSkillName(t.Name) || isDocxSkillName(str(sk["name"])) {
		if !looksLikeSkillScriptCommand(cmd) {
			title = normalizeDocxTitle(title)
			if title == "生成文档" || title == t.Name || strings.EqualFold(title, "docx") {
				if hint := inferDocxTitleFromMessage(ctx.UserMessage); hint != "" {
					title = hint
				} else {
					title = "生成文档"
				}
			}
			content := coalesce(str(call.Args["content"]), coalesce(str(call.Args["input"]), input))
			return s.skillRunDocxBuiltin(ctx, sk, title, content, track, started)
		}
	}

	if !looksLikeSkillScriptCommand(cmd) {
		entries := decodeStringSlice(sk["entrypoints"])
		scripts := decodeStringSlice(sk["scripts"])
		hint := strings.Join(scripts, ", ")
		if hint == "" {
			hint = strings.Join(entries, ", ")
		}
		return toolExecResult{
			Status: "needs_instruction", DurationMs: int(time.Since(started).Milliseconds()),
			Error: "command 不是可执行脚本路径",
			Output: "【skill.run】拒绝：command 须匹配 scripts/... 或 .copilot-ws/...\n" +
				"可用：" + coalesce(hint, "(无)") + "\n" +
				"请先 action=open 阅读 SKILL.md，再指定脚本。勿将自然语言当作已执行成功。",
			SandboxID: "skill-run:needs_instruction",
		}
	}

	pkgPath := str(sk["packagePath"])
	if pkgPath == "" {
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error: "无 packagePath", Output: "技能包未落盘，无法 run 脚本",
		}
	}

	id := ctx.Viewer
	if id == nil {
		return toolExecResult{Status: "denied", Permission: "auth", Error: "缺少身份", Output: "拒绝执行技能"}
	}

	skillID := str(sk["id"])
	s.Store.Lock()
	_, sk2 := s.findSkillLocked(ctx.WorkspaceID, skillID)
	if sk2 == nil && str(sk["workspaceId"]) != "" {
		_, sk2 = s.findSkillLocked(str(sk["workspaceId"]), skillID)
	}
	if sk2 == nil {
		s.Store.Unlock()
		return toolExecResult{Status: "failed", Error: "技能不存在", Output: "技能不存在", DurationMs: int(time.Since(started).Milliseconds())}
	}
	sk = sk2
	dec := s.evaluateSkillSandboxPolicyLocked(ctx.WorkspaceID, skillID, cmd)
	govPolicy := s.ensureSkillGovernanceLocked(skillID)
	pkgPayload := skillPackagePayload(sk2)
	if dec.Blocked {
		ms := int(time.Since(started).Milliseconds())
		s.Store.Unlock()
		s.recordSkillInvocationWithRequest(ctx.Request, ctx.WorkspaceID, sk2, ms, false, actor, "Copilot · 策略拦截")
		return toolExecResult{
			Status: "denied", Permission: "policy", Error: dec.Reason,
			Output: "策略拦截：" + dec.Reason, DurationMs: ms,
		}
	}
	s.Store.Unlock()

	body := map[string]any{
		"skillId": skillID, "input": input, "command": cmd,
		"correlationId": ctx.CorrelationID, "timeoutSec": 90,
	}
	token := auth.MintRunToken(skillID, ctx.WorkspaceID, id.ID, 5*time.Minute)
	body["runToken"] = token
	body["denyControlPlane"] = true
	body["allowedEgress"] = govPolicy["allowedEgress"]
	if pkgPayload != nil {
		for k, v := range pkgPayload {
			body[k] = v
		}
	}
	result, runtimeErr := s.callSkillRuntime(body)
	ms := int(time.Since(started).Milliseconds())
	if runtimeErr != nil {
		track(ms, false, "Copilot · 运行时失败")
		return toolExecResult{
			Status: "failed", DurationMs: ms, Error: runtimeErr.Error(),
			Output: "技能运行时不可用：" + runtimeErr.Error(), SandboxID: "skill-runtime",
		}
	}
	out := coalesce(str(result["stdout"]), coalesce(str(result["preview"]), fmt.Sprintf("%v", result)))
	if dl := str(result["downloadPath"]); dl != "" && !strings.Contains(out, dl) {
		out = strings.TrimSpace(out + "\n下载链接：" + dl)
	}
	status := "success"
	rtStatus := str(result["status"])
	if rtStatus == "needs_instruction" {
		status = "needs_instruction"
	} else if ok, isBool := result["ok"].(bool); isBool && !ok {
		status = "failed"
	}
	if d := intFrom(result["durationMs"]); d > 0 {
		ms = d
	}
	track(ms, status == "success", "Copilot · skill.run")
	errMsg := ""
	if status != "success" {
		errMsg = coalesce(str(result["error"]), status)
	}
	return toolExecResult{
		Status: status, DurationMs: ms, Output: truncateRunes(out, 4000),
		Error: errMsg, SandboxID: "skill-runtime:" + skillID,
	}
}

func (s *Server) skillRunDocxBuiltin(
	ctx toolRunContext,
	sk map[string]any,
	title, content string,
	track func(int, bool, string),
	started time.Time,
) toolExecResult {
	id := ctx.Viewer
	if id == nil {
		return toolExecResult{Status: "denied", Permission: "auth", Error: "缺少身份", Output: "拒绝执行技能"}
	}
	skillID := str(sk["id"])
	body := map[string]any{
		"skillId": skillID, "input": content, "command": content,
		"correlationId": ctx.CorrelationID,
		"action":        "generate_docx",
		"skillName":     "docx",
		"title":         title,
		"content":       content,
		"timeoutSec":    60,
	}
	s.Store.Lock()
	_, sk2 := s.findSkillLocked(ctx.WorkspaceID, skillID)
	if sk2 == nil && str(sk["workspaceId"]) != "" {
		_, sk2 = s.findSkillLocked(str(sk["workspaceId"]), skillID)
	}
	if sk2 == nil {
		s.Store.Unlock()
		filename, download, err := generateDocxArtifactLocal(title, content)
		ms := int(time.Since(started).Milliseconds())
		if err != nil {
			return toolExecResult{Status: "failed", DurationMs: ms, Error: err.Error(), Output: "docx 生成失败：" + err.Error()}
		}
		return toolExecResult{
			Status: "success", DurationMs: ms, SandboxID: "docx-local",
			Output: formatDocxToolOutput(title, filename, download, false),
		}
	}
	sk = sk2
	dec := s.evaluateSkillSandboxPolicyLocked(ctx.WorkspaceID, skillID, content)
	govPolicy := s.ensureSkillGovernanceLocked(skillID)
	pkgPayload := skillPackagePayload(sk2)
	if dec.Blocked {
		ms := int(time.Since(started).Milliseconds())
		s.Store.Unlock()
		s.recordSkillInvocationWithRequest(ctx.Request, ctx.WorkspaceID, sk2, ms, false, "助手", "Copilot · 策略拦截")
		return toolExecResult{
			Status: "denied", Permission: "policy", Error: dec.Reason,
			Output: "策略拦截：" + dec.Reason, DurationMs: ms,
		}
	}
	s.Store.Unlock()

	token := auth.MintRunToken(skillID, ctx.WorkspaceID, id.ID, 5*time.Minute)
	body["runToken"] = token
	body["denyControlPlane"] = true
	body["allowedEgress"] = govPolicy["allowedEgress"]
	if pkgPayload != nil {
		for k, v := range pkgPayload {
			body[k] = v
		}
	}
	result, runtimeErr := s.callSkillRuntime(body)
	ms := int(time.Since(started).Milliseconds())
	if runtimeErr != nil {
		filename, download, err := generateDocxArtifactLocal(title, content)
		if err == nil {
			track(ms, true, "Copilot · docx 本地回退")
			return toolExecResult{
				Status: "success", DurationMs: ms, SandboxID: "docx-local-fallback",
				Output: formatDocxToolOutput(title, filename, download, true),
			}
		}
		track(ms, false, "Copilot · docx 失败")
		return toolExecResult{
			Status: "failed", DurationMs: ms,
			Error:  fmt.Sprintf("docx 运行时失败：%v；本地回退：%v", runtimeErr, err),
			Output: "skill:docx 调用失败：" + runtimeErr.Error(),
		}
	}
	out := coalesce(str(result["stdout"]), fmt.Sprintf("%v", result))
	if str(result["downloadPath"]) != "" {
		storage := coalesce(str(result["filename"]), strings.TrimPrefix(str(result["downloadPath"]), "/api/skill-artifacts/"))
		displayTitle := coalesce(str(result["title"]), title)
		out = formatDocxToolOutput(displayTitle, storage, str(result["downloadPath"]), false)
	}
	status := "success"
	if ok, isBool := result["ok"].(bool); isBool && !ok {
		status = "failed"
	}
	track(ms, status == "success", "Copilot · docx entry")
	return toolExecResult{Status: status, DurationMs: ms, Output: truncateRunes(out, 2000), SandboxID: "skill-runtime:" + skillID}
}

// dispatchAuthorizedTool runs authorize → skill approval gate → queue or execute.
func (s *Server) dispatchAuthorizedTool(
	runCtx toolRunContext,
	reg []registeredTool,
	call toolCallRequest,
	sessionMode, risk string,
	emit reactEmitFunc,
) (tool *registeredTool, res toolExecResult) {
	tool, deny := authorizeToolCall(reg, call)
	if deny == nil && tool != nil && tool.Kind == "skill" {
		sk := s.resolveSkillForTool(runCtx.WorkspaceID, tool, str(call.Args["skillId"]))
		if skillInvocationNeedsApproval(sessionMode, tool, sk, call) {
			deny = &toolExecResult{
				Status: "denied", Permission: "approval_required",
				Error:  "工具需要人工审核授权后才能执行：" + tool.Name,
				Output: "写类 skill.run/write 需人工审核。请等待授权卡，勿声称已执行。",
			}
		}
	}
	if deny != nil {
		if deny.Permission == "approval_required" && tool != nil && normalizeSessionMode(sessionMode) == sessionModeExecute {
			if tool.Kind == "skill" {
				if call.Args == nil {
					call.Args = map[string]any{}
				}
				if normalizeSkillAction(call.Args) == "" {
					call.Args["action"] = skillActionRun
				}
			}
			return tool, s.queueToolAuthorization(runCtx, tool, call, coalesce(risk, "medium"), emit)
		}
		res = *deny
		return tool, res
	}
	return tool, s.runCopilotTool(runCtx, tool, call)
}
