package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
)

const (
	toolModeExecute   = "execute"
	toolModeRecommend = "recommend"
	toolModeApproval  = "approval_required"
	toolModeProhibit  = "prohibited"
)

// registeredTool is one executable capability in the Copilot Harness registry.
type registeredTool struct {
	Key              string
	Name             string
	Kind             string // builtin | tool | skill | workflow
	Mode             string
	Enabled          bool
	RequiresApproval bool
	Description      string
}

type toolCallRequest struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
}

type toolExecResult struct {
	Status     string // success | failed | denied
	DurationMs int
	Output     string
	Hits       any
	Permission string
	Error      string
	SandboxID  string
}

type toolRunContext struct {
	Request          *http.Request
	WorkspaceID      string
	OwnerID          string
	DigitalEmployee  string
	ConversationID   string
	CorrelationID    string
	UserMessage      string
	Viewer           *auth.Identity
	SessionMode      string
	RiskLevel        string
}

var toolCallBlockRe = regexp.MustCompile(`(?s)<<<TOOL>>>\s*(\{.*?\})\s*<<<END>>>`)

func slugToolName(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, " ", "-")
	return s
}

func capabilityMode(emp map[string]any, kind, name string) string {
	bp, _ := emp["boundaryPolicy"].(map[string]any)
	if bp == nil {
		return ""
	}
	for _, item := range knowledgeSliceMaps(bp["capabilityModes"]) {
		if str(item["capabilityType"]) == kind && str(item["capabilityName"]) == name {
			return strings.TrimSpace(str(item["mode"]))
		}
	}
	if arr, ok := bp["capabilityModes"].([]any); ok {
		for _, x := range arr {
			m, ok := x.(map[string]any)
			if !ok {
				continue
			}
			if str(m["capabilityType"]) == kind && str(m["capabilityName"]) == name {
				return strings.TrimSpace(str(m["mode"]))
			}
		}
	}
	return ""
}

func enabledToolSet(enabled []string) map[string]struct{} {
	out := map[string]struct{}{}
	for _, k := range enabled {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		out[k] = struct{}{}
		if i := strings.Index(k, ":"); i > 0 {
			out[k[i+1:]] = struct{}{}
			out[slugToolName(k[i+1:])] = struct{}{}
		}
		out[slugToolName(k)] = struct{}{}
	}
	return out
}

// buildToolRegistry intersects employee capabilities, boundary modes, and session enabledTools.
func buildToolRegistry(emp map[string]any, enabledTools []string) []registeredTool {
	enabled := enabledToolSet(enabledTools)
	enableAllNonApproval := len(enabledTools) == 0
	hasBuiltinSelector := false
	for _, k := range enabledTools {
		k = strings.TrimSpace(k)
		if strings.HasPrefix(k, "builtin:") || k == "knowledge.retrieve" || k == "memory.recall" {
			hasBuiltinSelector = true
			break
		}
	}

	var out []registeredTool
	seen := map[string]struct{}{}

	add := func(t registeredTool) {
		if t.Key == "" || t.Mode == toolModeProhibit {
			return
		}
		if _, ok := seen[t.Key]; ok {
			return
		}
		seen[t.Key] = struct{}{}
		t.RequiresApproval = t.Mode == toolModeApproval
		if t.Kind == "builtin" {
			if enableAllNonApproval {
				t.Enabled = true
			} else if hasBuiltinSelector {
				_, t.Enabled = enabled[t.Key]
				if !t.Enabled {
					_, t.Enabled = enabled[t.Name]
				}
				if !t.Enabled {
					_, t.Enabled = enabled[slugToolName(t.Name)]
				}
			} else {
				// 会话只勾选了员工装配工具时，平台检索/记忆仍默认可用
				t.Enabled = !t.RequiresApproval
			}
		} else if enableAllNonApproval {
			t.Enabled = !t.RequiresApproval
		} else {
			_, t.Enabled = enabled[t.Key]
			if !t.Enabled {
				_, t.Enabled = enabled[slugToolName(t.Name)]
			}
			if !t.Enabled {
				_, t.Enabled = enabled[t.Name]
			}
		}
		out = append(out, t)
	}

	add(registeredTool{
		Key: "builtin:knowledge.retrieve", Name: "knowledge.retrieve", Kind: "builtin",
		Mode: toolModeExecute, Description: "检索已发布知识库，返回相关片段",
	})
	add(registeredTool{
		Key: "builtin:memory.recall", Name: "memory.recall", Kind: "builtin",
		Mode: toolModeExecute, Description: "检索跨会话工作/长期记忆",
	})

	if emp == nil || emp["skipped"] == true {
		return out
	}

	caps, _ := emp["capabilities"].(map[string]any)
	if caps == nil {
		return out
	}

	pushCaps := func(kind string, names []string) {
		for _, raw := range names {
			name := strings.TrimSpace(raw)
			if name == "" {
				continue
			}
			mode := capabilityMode(emp, kind, name)
			if mode == "" {
				mode = toolModeRecommend
			}
			add(registeredTool{
				Key: kind + ":" + slugToolName(name), Name: name, Kind: kind,
				Mode: mode, Description: "已装配" + kind + " · " + name,
			})
		}
	}

	pushCaps("tool", stringSlice(caps["tools"]))
	pushCaps("skill", stringSlice(caps["skills"]))
	pushCaps("workflow", stringSlice(caps["workflows"]))
	return out
}

func registryLookup(reg []registeredTool, name string) *registeredTool {
	name = strings.TrimSpace(name)
	slug := slugToolName(name)
	for i := range reg {
		t := &reg[i]
		if t.Key == name || t.Name == name || slugToolName(t.Name) == slug {
			return t
		}
		if strings.TrimPrefix(t.Key, "builtin:") == name {
			return t
		}
	}
	return nil
}

func toolRegistryPrompt(reg []registeredTool) string {
	var enabled []registeredTool
	for _, t := range reg {
		if t.Enabled {
			enabled = append(enabled, t)
		}
	}
	if len(enabled) == 0 {
		return "本回合未启用任何工具。请直接根据对话历史与记忆作答，不要尝试调用工具。"
	}
	var b strings.Builder
	b.WriteString("你可以使用下列工具（ReAct）。需要工具时，先只输出一个工具调用块，不要夹杂最终答案：\n")
	b.WriteString("<<<TOOL>>>\n{\"name\":\"工具名\",\"args\":{...}}\n<<<END>>>\n")
	b.WriteString("收到工具观察结果后，再决定是否继续调用或给出最终中文回答。最终回答不要包含 <<<TOOL>>> 标记。\n")
	b.WriteString("可用工具：\n")
	for _, t := range enabled {
		b.WriteString("- ")
		b.WriteString(t.Name)
		b.WriteString("（")
		b.WriteString(t.Key)
		b.WriteString("）：")
		b.WriteString(t.Description)
		if t.RequiresApproval {
			b.WriteString(" [需审批，不可直接执行]")
		}
		if isDocxSkillName(t.Name) || isDocxSkillName(t.Key) {
			b.WriteString("；调用示例：{\"name\":\"")
			b.WriteString(t.Name)
			b.WriteString("\",\"args\":{\"title\":\"招聘岗位模板\",\"content\":\"一、基本信息\\n岗位名称：…\\n\\n二、岗位职责\\n1. …\\n\\n三、任职资格\\n1. …\\n\\n四、其他说明\\n…\"}}")
			b.WriteString("。title 用简短中文文档名（勿带 skill_docx / .docx）；content 按「一、二、三、」分节，条目用 1. 或 - 。")
		}
		b.WriteString("\n")
	}
	b.WriteString("常见：查制度/文档用 knowledge.retrieve；回忆用户偏好用 memory.recall。\n")
	return b.String()
}

func parseToolCall(text string) (toolCallRequest, bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return toolCallRequest{}, false
	}
	m := toolCallBlockRe.FindStringSubmatch(text)
	if len(m) != 2 {
		return toolCallRequest{}, false
	}
	var call toolCallRequest
	if err := json.Unmarshal([]byte(m[1]), &call); err != nil {
		return toolCallRequest{}, false
	}
	call.Name = strings.TrimSpace(call.Name)
	if call.Name == "" {
		return toolCallRequest{}, false
	}
	if call.Args == nil {
		call.Args = map[string]any{}
	}
	return call, true
}

func stripToolCallMarkers(text string) string {
	return strings.TrimSpace(toolCallBlockRe.ReplaceAllString(text, ""))
}

func authorizeToolCall(reg []registeredTool, call toolCallRequest) (*registeredTool, *toolExecResult) {
	t := registryLookup(reg, call.Name)
	if t == nil {
		return nil, &toolExecResult{
			Status: "denied", Error: "工具未注册：" + call.Name, Permission: "deny",
		}
	}
	if t.Mode == toolModeProhibit {
		return t, &toolExecResult{
			Status: "denied", Error: "工具已禁止：" + t.Name, Permission: "prohibited",
		}
	}
	if !t.Enabled {
		return t, &toolExecResult{
			Status: "denied", Error: "工具未在本会话启用：" + t.Name, Permission: "disabled",
		}
	}
	if t.RequiresApproval {
		return t, &toolExecResult{
			Status: "denied", Error: "工具需要人工审核授权后才能执行：" + t.Name, Permission: "approval_required",
		}
	}
	return t, nil
}

func (s *Server) runCopilotTool(ctx toolRunContext, t *registeredTool, call toolCallRequest) toolExecResult {
	started := time.Now()
	switch {
	case t.Name == "knowledge.retrieve" || t.Key == "builtin:knowledge.retrieve":
		query := coalesce(str(call.Args["query"]), ctx.UserMessage)
		hits, err := s.retrievePublished(ctx.Request, map[string]any{"query": query}, ctx.CorrelationID)
		res := toolExecResult{DurationMs: int(time.Since(started).Milliseconds()), Hits: hits}
		if err != nil {
			res.Status = "failed"
			res.Error = err.Error()
			res.Output = "检索失败：" + err.Error()
			return res
		}
		res.Status = "success"
		n := len(ragHitResults(hits))
		res.Output = fmt.Sprintf("knowledge.retrieve 完成：query=%q hits=%d backend=%s", query, n, coalesce(str(mapStr(hits, "backend")), "published-memory"))
		if n > 0 {
			res.Output += "\n" + strings.Join(ragSnippetsForPrompt(hits), "\n")
		} else {
			res.Output += "\n无命中"
		}
		return res

	case t.Name == "memory.recall" || t.Key == "builtin:memory.recall":
		query := coalesce(str(call.Args["query"]), ctx.UserMessage)
		s.Store.RLock()
		hits := s.retrieveMemoryForTurnLocked(ctx.WorkspaceID, ctx.OwnerID, ctx.DigitalEmployee, ctx.ConversationID, query, ctx.Viewer)
		s.Store.RUnlock()
		res := toolExecResult{Status: "success", DurationMs: int(time.Since(started).Milliseconds())}
		if len(hits) == 0 {
			res.Output = "memory.recall：无相关跨会话记忆"
			return res
		}
		var b strings.Builder
		b.WriteString(fmt.Sprintf("memory.recall：命中 %d 条\n", len(hits)))
		for _, h := range hits {
			b.WriteString("- [")
			b.WriteString(h.Layer)
			b.WriteString("] ")
			if h.Title != "" {
				b.WriteString(h.Title)
				b.WriteString("：")
			}
			b.WriteString(h.Content)
			b.WriteString("\n")
		}
		res.Output = strings.TrimSpace(b.String())
		return res

	case t.Kind == "skill":
		return s.runSkillTool(ctx, t, call, started)

	case t.Kind == "workflow":
		return toolExecResult{
			Status: "denied", DurationMs: int(time.Since(started).Milliseconds()),
			Permission: "not_implemented",
			Error:      "工作流需在工作流中心执行，会话内暂不直接触发：" + t.Name,
			Output:     "工作流「" + t.Name + "」未在会话 ReAct 中执行（请使用工作流运行入口）。",
		}

	case t.Kind == "tool":
		// Display-name enterprise tools without a concrete executor: honest failure, not fake success.
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error:  "工具执行器未接入：" + t.Name,
			Output: "工具「" + t.Name + "」已装配但运行时执行器尚未接入（Phase 1 仅支持 knowledge.retrieve / memory.recall / skill）。",
		}

	default:
		return toolExecResult{
			Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
			Error:  "未知工具类型",
			Output: "无法执行：" + t.Key,
		}
	}
}

func mapStr(v any, key string) string {
	m, ok := v.(map[string]any)
	if !ok {
		return ""
	}
	return str(m[key])
}

func (s *Server) findWorkspaceSkill(ws, skillID, toolName string) map[string]any {
	s.Store.RLock()
	defer s.Store.RUnlock()
	for _, item := range s.Store.Skills {
		if str(item["workspaceId"]) != ws {
			continue
		}
		name := str(item["name"])
		id := str(item["id"])
		if skillID != "" && id == skillID {
			return item
		}
		if strings.EqualFold(name, toolName) || slugToolName(name) == slugToolName(toolName) {
			return item
		}
		if isDocxSkillName(toolName) && isDocxSkillName(name) {
			return item
		}
	}
	return nil
}

func (s *Server) runSkillTool(ctx toolRunContext, t *registeredTool, call toolCallRequest, started time.Time) toolExecResult {
	ws := ctx.WorkspaceID
	skillID := coalesce(str(call.Args["skillId"]), "")
	input := coalesce(str(call.Args["input"]), coalesce(str(call.Args["command"]), coalesce(str(call.Args["content"]), ctx.UserMessage)))
	title := coalesce(str(call.Args["title"]), coalesce(str(call.Args["filename"]), t.Name))
	if isDocxSkillName(t.Name) || isDocxSkillName(t.Key) {
		title = normalizeDocxTitle(title)
		if title == "生成文档" || title == t.Name || strings.EqualFold(title, "docx") {
			if hint := inferDocxTitleFromMessage(ctx.UserMessage); hint != "" {
				title = hint
			} else {
				title = "生成文档"
			}
		}
	}

	actor := "助手"
	if ctx.Viewer != nil && ctx.Viewer.Name != "" {
		actor = ctx.Viewer.Name
	}

	sk := s.findWorkspaceSkill(ws, skillID, t.Name)
	if sk == nil && isDocxSkillName(t.Name) {
		s.Store.EnsureDocxSkillReady()
		sk = s.findWorkspaceSkill(ws, skillID, t.Name)
		if sk == nil {
			sk = s.findWorkspaceSkill("w1", "sk-docx", "docx")
		}
	}

	track := func(skill map[string]any, ms int, ok bool, source string) {
		if skill == nil {
			return
		}
		// Governance overview filters by current workspace; record against caller's ws.
		s.recordSkillInvocation(ws, skill, ms, ok, actor, source)
		if ctx.DigitalEmployee != "" {
			s.recordEmployeeRuntime(ctx.DigitalEmployee, ms, ok)
		}
	}

	if sk == nil {
		if !isDocxSkillName(t.Name) {
			return toolExecResult{
				Status: "failed", DurationMs: int(time.Since(started).Milliseconds()),
				Error:  "技能不存在：" + t.Name,
				Output: "未找到工作区内技能「" + t.Name + "」",
			}
		}
		filename, download, err := generateDocxArtifactLocal(title, input)
		ms := int(time.Since(started).Milliseconds())
		if err != nil {
			return toolExecResult{Status: "failed", DurationMs: ms, Error: err.Error(), Output: "docx 生成失败：" + err.Error()}
		}
		return toolExecResult{
			Status: "success", DurationMs: ms, SandboxID: "docx-local",
			Output: formatDocxToolOutput(title, filename, download, false),
		}
	}

	skillID = str(sk["id"])
	body := map[string]any{
		"skillId": skillID, "input": input, "command": input,
		"correlationId": ctx.CorrelationID,
	}
	if isDocxSkillName(t.Name) || isDocxSkillName(str(sk["name"])) {
		body["action"] = "generate_docx"
		body["skillName"] = "docx"
		body["title"] = title
		body["content"] = input
		body["timeoutSec"] = 60
	}
	id := ctx.Viewer
	if id == nil {
		return toolExecResult{Status: "denied", Permission: "auth", Error: "缺少身份", Output: "拒绝执行技能"}
	}

	s.Store.Lock()
	_, sk2 := s.findSkillLocked(ws, skillID)
	if sk2 == nil && str(sk["workspaceId"]) != "" {
		// Allow recording against ensured builtin when workspace mismatch (e.g. seed w1).
		_, sk2 = s.findSkillLocked(str(sk["workspaceId"]), skillID)
	}
	if sk2 == nil {
		s.Store.Unlock()
		return toolExecResult{Status: "failed", Error: "技能不存在", Output: "技能不存在", DurationMs: int(time.Since(started).Milliseconds())}
	}
	sk = sk2
	dec := s.evaluateSkillSandboxPolicyLocked(ws, skillID, input)
	govPolicy := s.ensureSkillGovernanceLocked(skillID)
	pkgPayload := skillPackagePayload(sk2)
	if dec.Blocked {
		s.recordSkillInvocationLocked(ws, sk2, int(time.Since(started).Milliseconds()), false, actor, "Copilot · 策略拦截")
		s.Store.Unlock()
		s.Store.Persist("skill_health")
		s.Store.Persist("skill_extra")
		return toolExecResult{
			Status: "denied", Permission: "policy", Error: dec.Reason,
			Output: "策略拦截：" + dec.Reason, DurationMs: int(time.Since(started).Milliseconds()),
		}
	}
	s.Store.Unlock()

	token := auth.MintRunToken(skillID, ws, id.ID, 5*time.Minute)
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
		if isDocxSkillName(t.Name) || isDocxSkillName(str(sk["name"])) {
			filename, download, err := generateDocxArtifactLocal(title, input)
			if err == nil {
				track(sk, ms, true, "Copilot · docx 本地回退")
				return toolExecResult{
					Status: "success", DurationMs: ms, SandboxID: "docx-local-fallback",
					Output: formatDocxToolOutput(title, filename, download, true),
				}
			}
			track(sk, ms, false, "Copilot · docx 失败")
			return toolExecResult{
				Status: "failed", DurationMs: ms,
				Error:  fmt.Sprintf("连接本地文档服务（%s）失败：%v；本地回退也失败：%v", envOr("DE_SKILL_RUNTIME_URL", "http://127.0.0.1:8093"), runtimeErr, err),
				Output: "skill:docx 调用失败：" + runtimeErr.Error(),
			}
		}
		track(sk, ms, false, "Copilot · 运行时失败")
		return toolExecResult{
			Status: "failed", DurationMs: ms, Error: runtimeErr.Error(),
			Output: "技能运行时不可用：" + runtimeErr.Error(), SandboxID: "skill-runtime",
		}
	}
	out := coalesce(str(result["stdout"]), coalesce(str(result["preview"]), fmt.Sprintf("%v", result)))
	if (isDocxSkillName(t.Name) || isDocxSkillName(str(sk["name"]))) && str(result["downloadPath"]) != "" {
		storage := coalesce(str(result["filename"]), strings.TrimPrefix(str(result["downloadPath"]), "/api/skill-artifacts/"))
		displayTitle := coalesce(str(result["title"]), title)
		out = formatDocxToolOutput(displayTitle, storage, str(result["downloadPath"]), false)
	} else if dl := str(result["downloadPath"]); dl != "" && !strings.Contains(out, dl) {
		out = strings.TrimSpace(out + "\n下载链接：" + dl)
	}
	status := "success"
	if ok, isBool := result["ok"].(bool); isBool && !ok {
		status = "failed"
	}
	if d := intFrom(result["durationMs"]); d > 0 {
		ms = d
	}
	track(sk, ms, status == "success", "Copilot · 技能调用")
	return toolExecResult{
		Status: status, DurationMs: ms, Output: truncateRunes(out, 2000),
		SandboxID: "skill-runtime:" + skillID,
	}
}

func enabledToolKeys(reg []registeredTool) []string {
	var out []string
	for _, t := range reg {
		if t.Enabled {
			out = append(out, t.Key)
		}
	}
	return out
}

func toolCallToPersist(id, name string, args map[string]any, res toolExecResult) map[string]any {
	status := res.Status
	if status == "" {
		status = "success"
	}
	item := map[string]any{
		"id": id, "name": name, "args": args, "status": status,
		"durationMs": res.DurationMs,
	}
	if res.Permission != "" {
		item["permission"] = res.Permission
	}
	if res.SandboxID != "" {
		item["sandboxId"] = res.SandboxID
	}
	if res.Error != "" {
		item["error"] = res.Error
	}
	if res.Output != "" {
		item["result"] = truncateRunes(res.Output, 500)
	}
	return item
}
