package server

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var reOfficeDepFlag = regexp.MustCompile(`(?i)(?:--(?:outline-file|outline|input|spec|patch-file|spec-file))\s+("([^"]+)"|'([^']+)'|(\S+))`)

// copilotWSInputDepsFromCommand extracts input .copilot-ws/ paths (outline/spec); excludes --out targets.
func copilotWSInputDepsFromCommand(cmd string) []string {
	cmd = strings.TrimSpace(cmd)
	if cmd == "" {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, 2)
	add := func(raw string) {
		p := normalizeCopilotWSPath(raw)
		if p == "" {
			return
		}
		if _, ok := seen[p]; ok {
			return
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	for _, m := range reOfficeDepFlag.FindAllStringSubmatch(cmd, -1) {
		if len(m) < 5 {
			continue
		}
		add(coalesce(m[2], coalesce(m[3], m[4])))
	}
	return out
}

func copilotWSDepsFromCommand(cmd string) []string {
	return copilotWSInputDepsFromCommand(cmd)
}

func normalizeCopilotWSPath(raw string) string {
	p := filepathToSlash(strings.TrimSpace(raw))
	p = strings.Trim(p, `"'`)
	if p == "" || strings.Contains(p, "..") {
		return ""
	}
	if !strings.HasPrefix(p, ".copilot-ws/") {
		return ""
	}
	return p
}

func writeContentFromArgs(args map[string]any) string {
	return strings.TrimSpace(coalesce(str(args["outline"]), coalesce(str(args["content"]), coalesce(str(args["input"]), str(args["body"])))))
}

// inferOfficeOutline produces a real, multi-section outline for an office skill when the model
// did not supply outline/content in args. Replaces the old 3-bullet placeholder which generated
// 1-page stub PPTs. Branched per skill kind so PPT/Word/Excel each get a sensible skeleton.
//
// Why: previously `defaultOutlinePlaceholder(skillName)` always returned the same 3-bullet text
// regardless of skill type, producing a 1-page stub PPT even for legitimate requests like
// "输出 Q3 研发季度汇报模版 PPT". The PPT-specific templates already exist
// (defaultPptxOutlineForMessage); this routes through them and adds docx/xlsx equivalents.
func inferOfficeOutline(tool *registeredTool, userMessage string) string {
	name := ""
	if tool != nil {
		name = strings.ToLower(strings.TrimSpace(tool.Name))
	}
	switch {
	case isPptxSkillName(name):
		title := inferPptxTitleFromMessage(userMessage)
		if title == "" && tool != nil {
			title = strings.TrimSpace(tool.Name)
		}
		return defaultPptxOutlineForMessage(title, userMessage)
	case isDocxSkillName(name):
		title := inferDocxTitleFromMessage(userMessage)
		if title == "" && tool != nil {
			title = strings.TrimSpace(tool.Name)
		}
		return defaultDocxOutlineForMessage(title, userMessage)
	case isSpreadsheetSkillName(name):
		title := inferXlsxTitleFromMessage(userMessage)
		if title == "" && tool != nil {
			title = strings.TrimSpace(tool.Name)
		}
		return defaultXlsxOutlineForMessage(title, userMessage)
	}
	return ""
}

func planWritesPath(plan map[string]any, dep string) bool {
	dep = normalizeCopilotWSPath(dep)
	if dep == "" {
		return false
	}
	for _, st := range skillTurnSteps(plan) {
		if str(st["action"]) != skillActionWrite {
			continue
		}
		a, _ := st["args"].(map[string]any)
		if a == nil {
			continue
		}
		if normalizeCopilotWSPath(skillWritePathFromArgs(a)) == dep {
			return true
		}
		if normalizeCopilotWSPath(str(a["path"])) == dep {
			return true
		}
	}
	return false
}

// injectWriteStepsForRunDependencies prepends write steps for .copilot-ws files referenced by run command.
func injectWriteStepsForRunDependencies(steps []map[string]any, args map[string]any, cmd, userMessage string, tool *registeredTool) []map[string]any {
	if tool == nil || !officeSkillName(tool.Name) {
		return steps
	}
	deps := copilotWSDepsFromCommand(cmd)
	if len(deps) == 0 {
		return steps
	}
	plan := map[string]any{"steps": steps}
	prefix := make([]map[string]any, 0, len(deps))
	content := writeContentFromArgs(args)
	for _, dep := range deps {
		if planWritesPath(plan, dep) {
			continue
		}
		already := false
		for _, p := range prefix {
			a, _ := p["args"].(map[string]any)
			if normalizeCopilotWSPath(skillWritePathFromArgs(a)) == dep {
				already = true
				break
			}
		}
		if already {
			continue
		}
		writeArgs := cloneArgs(args)
		writeArgs["action"] = skillActionWrite
		writeArgs["path"] = dep
		if content != "" {
			writeArgs["content"] = content
		} else {
			// Real outline generated from user intent (replaces old 3-bullet placeholder).
			// If inference returns empty (unknown skill), leave content unset so preflight
			// can refuse rather than silently fabricating a stub.
			if inferred := inferOfficeOutline(tool, userMessage); inferred != "" {
				writeArgs["content"] = inferred
			}
		}
		stepID := "write-" + strings.NewReplacer("/", "-", ".", "-").Replace(dep)
		prefix = append(prefix, map[string]any{
			"id": stepID, "action": skillActionWrite,
			"title": "写入 " + dep,
			"args":  writeArgs, "status": "pending",
		})
	}
	if len(prefix) == 0 {
		return steps
	}
	return append(prefix, steps...)
}

// officeOutlineQuality returns (minSections, minChars, requireH1) for content quality checks.
func officeOutlineQuality(skillName string) (minSections, minChars int, requireH1 bool) {
	n := strings.ToLower(strings.TrimSpace(skillName))
	switch {
	case isPptxSkillName(n):
		return 3, 200, true
	case isDocxSkillName(n):
		return 3, 200, true
	case isSpreadsheetSkillName(n):
		return 1, 80, false
	}
	return 0, 0, false
}

// officeSkillRunPreflight validates package and run dependencies before sandbox execution.
// Beyond file existence, it now checks content quality (min sections / chars) to refuse
// fabricated placeholders and trivially-thin outlines.
func officeSkillRunPreflight(sk map[string]any, cmd string) (fail toolExecResult, ok bool) {
	if sk == nil {
		return toolExecResult{}, true
	}
	name := coalesce(str(sk["name"]), "")
	if !isOfficeSkillName(name) && !officeSkillName(name) {
		return toolExecResult{}, true
	}
	if !looksLikeSkillScriptCommand(cmd) {
		return toolExecResult{}, true
	}
	pkgPath := strings.TrimSpace(str(sk["packagePath"]))
	if pkgPath == "" {
		IncOfficeSkillPackageMissing()
		msg := fmt.Sprintf("技能包未落盘（packagePath 为空），请先在技能中心安装并启用「%s」", coalesce(name, "office"))
		return toolExecResult{
			Status: "failed", Error: msg,
			Output: "【预检失败】" + msg + "\n提示：安装内置 pptx/docx 技能包后重试。",
		}, false
	}
	if _, err := os.Stat(pkgPath); err != nil {
		IncOfficeSkillPackageMissing()
		msg := fmt.Sprintf("技能包目录不存在：%s", pkgPath)
		return toolExecResult{
			Status: "failed", Error: msg,
			Output: "【预检失败】" + msg,
		}, false
	}
	minSec, minChars, requireH1 := officeOutlineQuality(name)
	for _, dep := range copilotWSDepsFromCommand(cmd) {
		full := filepath.Join(pkgPath, filepath.FromSlash(dep))
		st, err := os.Stat(full)
		if err != nil {
			IncOfficeSkillPreflightFailed()
			msg := fmt.Sprintf("缺少依赖文件 %s（须先 action=write 写入或等待 Skill Turn write 步骤完成）", dep)
			return toolExecResult{
				Status: "failed", Error: msg,
				Output: "【预检失败】" + msg,
			}, false
		}
		if minSec == 0 && minChars == 0 {
			continue
		}
		raw, rerr := os.ReadFile(full)
		if rerr != nil {
			IncOfficeSkillPreflightFailed()
			msg := fmt.Sprintf("无法读取依赖文件 %s：%v", dep, rerr)
			return toolExecResult{
				Status: "failed", Error: msg,
				Output: "【预检失败】" + msg,
			}, false
		}
		if st.Size() == 0 || strings.TrimSpace(string(raw)) == "" {
			IncOfficeSkillPreflightFailed()
			msg := fmt.Sprintf("依赖文件 %s 内容为空，请在 write 步骤补充大纲或正文", dep)
			return toolExecResult{
				Status: "failed", Error: msg,
				Output: "【预检失败】" + msg,
			}, false
		}
		body := string(raw)
		// count markdown sections (# ... ignoring #!/shebangs)
		h1 := 0
		sec := 0
		for _, line := range strings.Split(body, "\n") {
			trim := strings.TrimSpace(line)
			if strings.HasPrefix(trim, "# ") {
				h1++
				sec++
			} else if strings.HasPrefix(trim, "## ") {
				sec++
			}
		}
		runes := len([]rune(body))
		if requireH1 && h1 < 1 {
			IncOfficeSkillPreflightFailed()
			msg := fmt.Sprintf("依赖文件 %s 缺少一级标题（# 标题），无法渲染为 %s 产物", dep, name)
			return toolExecResult{
				Status: "failed", Error: msg,
				Output: "【预检失败】" + msg,
			}, false
		}
		if sec < minSec || runes < minChars {
			IncOfficeSkillPreflightFailed()
			msg := fmt.Sprintf("依赖文件 %s 内容不足：至少需要 %d 个章节、%d 个字符（当前 %d 章节 / %d 字符）", dep, minSec, minChars, sec, runes)
			return toolExecResult{
				Status: "failed", Error: msg,
				Output: "【预检失败】" + msg + "\n提示：在 write 步骤补充内容后再执行。",
			}, false
		}
	}
	return toolExecResult{}, true
}
