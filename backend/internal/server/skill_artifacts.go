package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
	"github.com/digital-employee-platform/backend/pkg/response"
)

var (
	reSkillDocxPrefix    = regexp.MustCompile(`(?i)^skill[_-]?docx[_-]*`)
	reDocxSuffix         = regexp.MustCompile(`(?i)(_docx|\.docx)$`)
	reArtifactIDPref     = regexp.MustCompile(`(?i)^[a-z0-9]{6,12}-`)
	reMultiSpace         = regexp.MustCompile(`\s+`)
	reMultiUnderscore    = regexp.MustCompile(`_+`)
	reDocxPlaceholderKV  = regexp.MustCompile(`(?i)^\s*title\s*=\s*.+\s*,\s*content\s*=`)
)

// looksLikeCodeAsDocxBody detects python-docx scripts mistaken for document body.
func looksLikeCodeAsDocxBody(content string) bool {
	s := strings.TrimSpace(content)
	if s == "" {
		return false
	}
	lower := strings.ToLower(s)
	strong := []string{
		"from docx import",
		"import docx",
		"document()",
		"qn('w:eastasia')",
		"wd_align_paragraph",
		"python-docx",
		"```python",
		"add_heading(",
		"add_paragraph(",
	}
	for _, sig := range strong {
		if strings.Contains(lower, sig) {
			return true
		}
	}
	lines := strings.Split(s, "\n")
	codeLines := 0
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == "" {
			continue
		}
		if strings.HasPrefix(trim, "import ") || strings.HasPrefix(trim, "from ") ||
			strings.HasPrefix(trim, "def ") || strings.HasPrefix(trim, "class ") {
			codeLines++
		}
	}
	return codeLines >= 2
}

// looksLikeDocxPlaceholderBody detects LLM summary / title=content= strings mistaken for document body.
func looksLikeDocxPlaceholderBody(content string) bool {
	s := strings.TrimSpace(content)
	if s == "" {
		return false
	}
	if reDocxPlaceholderKV.MatchString(s) {
		return true
	}
	runes := len([]rune(s))
	if runes >= 160 && looksLikeStructuredDocxBody(s) {
		return false
	}
	lower := strings.ToLower(s)
	for _, hint := range []string{
		"可编辑", "摘要", "按检索", "整理的正文", "整理的可编辑", "占位", "placeholder",
		"待生成", "模板正文", "正文内容", "详见", "如下所示",
	} {
		if strings.Contains(lower, hint) && runes < 160 {
			return true
		}
	}
	if runes < 80 && !looksLikeStructuredDocxBody(s) {
		return true
	}
	return false
}

func looksLikeStructuredDocxBody(s string) bool {
	for _, marker := range []string{
		"一、", "二、", "三、", "（一）", "##", "###",
		"岗位职责", "任职要求", "招聘信息", "基本信息", "任职资格",
	} {
		if strings.Contains(s, marker) {
			return true
		}
	}
	return strings.Count(s, "\n") >= 4
}

func sanitizeDocxBody(content string) string {
	if looksLikeCodeAsDocxBody(content) || looksLikeDocxPlaceholderBody(content) || looksLikeClarificationSpeech(content) {
		return ""
	}
	return strings.TrimSpace(content)
}

// docxToolSucceeded reports whether a docx-class tool completed successfully this turn.
func docxToolSucceeded(toolCalls []map[string]any) bool {
	for i := len(toolCalls) - 1; i >= 0; i-- {
		tc := toolCalls[i]
		name := strings.ToLower(str(tc["name"]))
		if !isDocxSkillName(name) && !strings.Contains(name, "docx") {
			continue
		}
		st := strings.ToLower(strings.TrimSpace(str(tc["status"])))
		if st == "" || st == "success" || st == "ok" || st == "succeeded" {
			return true
		}
	}
	return false
}

func docxPreviewText(payload map[string]any) string {
	raw, ok := payload["blocks"].([]any)
	if !ok {
		return ""
	}
	var b strings.Builder
	for _, item := range raw {
		m, _ := item.(map[string]any)
		b.WriteString(str(m["text"]))
		b.WriteByte('\n')
	}
	return strings.TrimSpace(b.String())
}

func docxPreviewLooksLikeCode(payload map[string]any) bool {
	return looksLikeCodeAsDocxBody(docxPreviewText(payload))
}

func docxPreviewLooksLikePlaceholder(payload map[string]any) bool {
	return looksLikeDocxPlaceholderBody(docxPreviewText(payload))
}

func docxPreviewSubstantiallyShorterThan(payload map[string]any, body string) bool {
	preview := docxPreviewText(payload)
	if preview == "" || body == "" {
		return false
	}
	pr, br := len([]rune(preview)), len([]rune(body))
	if looksLikeDocxPlaceholderBody(preview) {
		return br > pr+20
	}
	return br >= 200 && pr < br/3
}

func skillArtifactDir() string {
	if v := strings.TrimSpace(os.Getenv("DE_SKILL_ARTIFACT_DIR")); v != "" {
		return v
	}
	return "/tmp/de-stack/artifacts"
}

func isDocxSkillName(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	return n == "docx" || n == "word" || strings.Contains(n, "docx") || n == "文档生成" || n == "word文档"
}

func isPptxSkillName(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	return n == "pptx" || n == "ppt" || strings.Contains(n, "pptx") ||
		strings.Contains(n, "幻灯") || n == "演示文稿" || n == "ppt生成"
}

// normalizeDocxTitle turns LLM / tool noise into a short readable Chinese title.
func normalizeDocxTitle(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.Trim(s, "《》「」『』\"'`")
	s = reSkillDocxPrefix.ReplaceAllString(s, "")
	s = reDocxSuffix.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "__", " ")
	s = strings.ReplaceAll(s, "_", " ")
	s = reMultiSpace.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	// Drop leading hex id if title itself was a storage name
	s = reArtifactIDPref.ReplaceAllString(s, "")
	s = reSkillDocxPrefix.ReplaceAllString(s, "")
	s = reDocxSuffix.ReplaceAllString(s, "")
	s = strings.TrimSpace(s)
	if s == "" || strings.EqualFold(s, "docx") || s == "文档生成" || s == "word" {
		return "生成文档"
	}
	runes := []rune(s)
	if len(runes) > 32 {
		s = string(runes[:32])
	}
	return strings.TrimSpace(s)
}

// docxDownloadBasename is the user-facing download name, e.g. 招聘岗位模板.docx
func docxDownloadBasename(title string) string {
	title = normalizeDocxTitle(title)
	var b strings.Builder
	for _, r := range title {
		switch {
		case unicode.Is(unicode.Han, r):
			b.WriteRune(r)
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
		case r == '-' || r == '·':
			b.WriteRune(r)
		case unicode.IsSpace(r):
			// skip spaces in filenames for cleaner downloads
		default:
			// drop punctuation / book marks
		}
	}
	base := strings.Trim(b.String(), ".-")
	if base == "" {
		base = "生成文档"
	}
	if utf8.RuneCountInString(base) > 32 {
		base = string([]rune(base)[:32])
	}
	return base + ".docx"
}

// docxStorageName keeps a short id prefix to avoid collisions on disk.
func docxStorageName(downloadBasename string) string {
	base := filepath.Base(downloadBasename)
	if !strings.HasSuffix(strings.ToLower(base), ".docx") {
		base += ".docx"
	}
	id := fmt.Sprintf("%x", time.Now().UnixNano()%0xffffffffffff)
	if len(id) > 12 {
		id = id[len(id)-12:]
	}
	return id + "-" + base
}

// docxDisplayNameFromStorage strips the collision id for Content-Disposition / UI.
func docxDisplayNameFromStorage(storage string) string {
	name := filepath.Base(strings.TrimSpace(storage))
	if reArtifactIDPref.MatchString(name) {
		rest := reArtifactIDPref.ReplaceAllString(name, "")
		if rest != "" {
			return docxDownloadBasename(rest)
		}
	}
	return docxDownloadBasename(name)
}

func skillArtifactStorageName(raw string) string {
	name := filepath.Base(strings.TrimSpace(raw))
	name = strings.Trim(name, "`\"'")
	if decoded, err := url.PathUnescape(name); err == nil && decoded != "" {
		name = decoded
	}
	return name
}

func skillArtifactFilePath(storageName string) string {
	return filepath.Join(skillArtifactDir(), skillArtifactStorageName(storageName))
}

func skillArtifactExists(storageName string) bool {
	storageName = skillArtifactStorageName(storageName)
	if storageName == "" {
		return false
	}
	st, err := os.Stat(skillArtifactFilePath(storageName))
	return err == nil && !st.IsDir()
}

func fetchSkillArtifactFromRuntime(storageName string) error {
	storageName = skillArtifactStorageName(storageName)
	if storageName == "" {
		return fmt.Errorf("empty artifact name")
	}
	client := &http.Client{Timeout: 8 * time.Second}
	runtimeURL := strings.TrimRight(envOr("DE_SKILL_RUNTIME_URL", "http://127.0.0.1:8093"), "/")
	reqURL := runtimeURL + "/v1/artifacts/" + url.PathEscape(storageName)
	resp, err := client.Get(reqURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("runtime artifact status %d", resp.StatusCode)
	}
	dir := skillArtifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	outPath := filepath.Join(dir, storageName)
	f, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := io.Copy(f, resp.Body); err != nil {
		_ = os.Remove(outPath)
		return err
	}
	return nil
}

// ensureDocxArtifactOnDisk guarantees a .docx exists in the local artifact dir.
func ensureDocxArtifactOnDisk(title, content, preferredStorage string) (storageName, downloadPath string, err error) {
	preferredStorage = skillArtifactStorageName(preferredStorage)
	body := sanitizeDocxBody(content)
	if preferredStorage != "" && skillArtifactExists(preferredStorage) {
		replace := false
		if payload, previewErr := loadDocxPreviewPayload(preferredStorage); previewErr == nil {
			if docxPreviewLooksLikeCode(payload) || docxPreviewLooksLikePlaceholder(payload) {
				replace = true
			} else if body != "" && docxPreviewSubstantiallyShorterThan(payload, body) {
				replace = true
			}
		}
		if replace && body != "" {
			_ = os.Remove(skillArtifactFilePath(preferredStorage))
		} else if !replace {
			return preferredStorage, "/api/skill-artifacts/" + preferredStorage, nil
		} else {
			return preferredStorage, "/api/skill-artifacts/" + preferredStorage, nil
		}
	}
	if preferredStorage != "" {
		if fetchErr := fetchSkillArtifactFromRuntime(preferredStorage); fetchErr == nil && skillArtifactExists(preferredStorage) {
			return preferredStorage, "/api/skill-artifacts/" + preferredStorage, nil
		}
	}
	if body != "" && preferredStorage != "" && strings.HasSuffix(strings.ToLower(preferredStorage), ".docx") {
		return generateDocxArtifactLocalNamed(title, content, preferredStorage)
	}
	return generateDocxArtifactLocal(title, content)
}

func replaceSkillArtifactPath(output, oldStorage, newStorage string) string {
	if oldStorage == "" || newStorage == "" || oldStorage == newStorage {
		return output
	}
	oldPath := "/api/skill-artifacts/" + oldStorage
	newPath := "/api/skill-artifacts/" + newStorage
	out := strings.ReplaceAll(output, oldPath, newPath)
	encOld := "/api/skill-artifacts/" + url.PathEscape(oldStorage)
	encNew := "/api/skill-artifacts/" + url.PathEscape(newStorage)
	return strings.ReplaceAll(out, encOld, encNew)
}

// ensureSkillArtifactsInOutput syncs .docx artifacts already referenced in assistant output (no new generation).
func ensureSkillArtifactsInOutput(output, title, content string) string {
	if strings.TrimSpace(output) == "" {
		return output
	}
	// 已有 pptx 产物时不要再旁路生成 Word，避免「生成 PPT」回合双文件。
	if hasPptxArtifactText(output) {
		re := regexp.MustCompile(`/api/skill-artifacts/([^\s)\]"'` + "`" + `<>]+)`)
		hasDocxLink := false
		for _, m := range re.FindAllStringSubmatch(output, -1) {
			if len(m) >= 2 && strings.HasSuffix(strings.ToLower(skillArtifactStorageName(m[1])), ".docx") {
				hasDocxLink = true
				break
			}
		}
		if !hasDocxLink {
			return output
		}
	}
	re := regexp.MustCompile(`/api/skill-artifacts/([^\s)\]"'` + "`" + `<>]+)`)
	matches := re.FindAllStringSubmatch(output, -1)
	displayTitle := normalizeDocxTitle(title)
	body := sanitizeDocxBody(content)
	if body == "" {
		return output
	}
	if len(matches) == 0 {
		return output
	}
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		storage := skillArtifactStorageName(m[1])
		if storage == "" || !strings.HasSuffix(strings.ToLower(storage), ".docx") {
			continue
		}
		ensured, _, err := ensureDocxArtifactOnDisk(displayTitle, body, storage)
		if err != nil {
			continue
		}
		output = replaceSkillArtifactPath(output, storage, ensured)
	}
	return output
}

func docxBodyFromToolCalls(toolCalls []map[string]any) string {
	for i := len(toolCalls) - 1; i >= 0; i-- {
		tc := toolCalls[i]
		name := strings.ToLower(str(tc["name"]))
		if !isDocxSkillName(name) && !strings.Contains(name, "docx") {
			continue
		}
		args, _ := tc["args"].(map[string]any)
		if args == nil {
			continue
		}
		if body := sanitizeDocxBody(coalesce(str(args["content"]), coalesce(str(args["input"]), str(args["command"])))); body != "" {
			return body
		}
	}
	return ""
}

func extractDocxBodyFromAssistantText(full string) string {
	lines := strings.Split(stripArtifactNoise(full), "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "已生成 Word") || strings.HasPrefix(trim, "已为您生成") ||
			strings.HasPrefix(trim, "文件名：") || strings.HasPrefix(trim, "下载链接：") ||
			strings.Contains(trim, "/api/skill-artifacts/") {
			continue
		}
		if isPendingAssistantReply(trim) && len(out) == 0 {
			continue
		}
		out = append(out, line)
	}
	body := strings.TrimSpace(strings.Join(out, "\n"))
	if body == "" || looksLikeDocxPlaceholderBody(body) {
		return ""
	}
	runes := len([]rune(body))
	if runes < 120 && !looksLikeStructuredDocxBody(body) {
		return ""
	}
	return body
}

// resolveDocxBodyForTurn picks the best docx body from assistant reply vs tool args.
func resolveDocxBodyForTurn(full string, toolCalls []map[string]any, userMessage string) string {
	if body := extractDocxBodyFromAssistantText(full); body != "" {
		toolBody := docxBodyFromToolCalls(toolCalls)
		if toolBody == "" || len([]rune(body)) > len([]rune(toolBody))+50 || looksLikeDocxPlaceholderBody(toolBody) {
			return body
		}
	}
	if body := docxBodyFromToolCalls(toolCalls); body != "" {
		return body
	}
	if body := sanitizeDocxBody(extractDocxBodyFromSkillOutput(full)); body != "" {
		return body
	}
	user := strings.TrimSpace(userMessage)
	if user != "" && !looksLikeDocxPlaceholderBody(user) && (len([]rune(user)) >= 120 || looksLikeStructuredDocxBody(user)) {
		return user
	}
	return ""
}

func resolveDocxBodyFromExecution(args map[string]any, userMessage, output string, plan map[string]any) string {
	if args != nil {
		path := coalesce(str(args["path"]), str(args["filename"]))
		if looksLikeSkillScriptCommand(path) || strings.HasSuffix(strings.ToLower(path), ".py") {
			// 脚本 write 参数不得作为 docx 正文
		} else if body := sanitizeDocxBody(coalesce(str(args["content"]), str(args["input"]))); body != "" {
			return body
		}
	}
	if plan != nil {
		for _, st := range skillTurnSteps(plan) {
			stepArgs, _ := st["args"].(map[string]any)
			if stepArgs == nil {
				continue
			}
			path := coalesce(str(stepArgs["path"]), coalesce(str(stepArgs["filename"]), str(stepArgs["command"])))
			if looksLikeSkillScriptCommand(path) || strings.HasSuffix(strings.ToLower(path), ".py") {
				continue
			}
			if body := sanitizeDocxBody(coalesce(str(stepArgs["content"]), str(stepArgs["input"]))); body != "" {
				return body
			}
		}
	}
	if body := sanitizeDocxBody(extractDocxBodyFromSkillOutput(output)); body != "" {
		return body
	}
	if body := extractDocxBodyFromAssistantText(output); body != "" {
		return body
	}
	user := strings.TrimSpace(userMessage)
	if looksLikeCodeAsDocxBody(user) {
		return ""
	}
	return user
}

func extractDocxBodyFromSkillOutput(output string) string {
	lines := strings.Split(output, "\n")
	var body []string
	capture := false
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.Contains(trim, "—— 步骤") || strings.Contains(trim, "—— 授权后执行结果") {
			capture = true
			continue
		}
		if !capture {
			continue
		}
		if strings.HasPrefix(trim, "已生成 Word 文档") ||
			strings.HasPrefix(trim, "文件名：") ||
			strings.HasPrefix(trim, "下载链接：") ||
			strings.Contains(trim, "/api/skill-artifacts/") ||
			strings.HasPrefix(trim, "【Skill Turn】") ||
			strings.HasPrefix(trim, "请把下载链接") {
			continue
		}
		if trim == "" && len(body) == 0 {
			continue
		}
		body = append(body, line)
	}
	return strings.TrimSpace(strings.Join(body, "\n"))
}

func findGenerateDocxScript() (string, error) {
	candidates := []string{
		filepath.Join("scripts", "generate_docx.py"),
		filepath.Join("..", "scripts", "generate_docx.py"),
		"/Users/LIANJIFU/ops/digital-employee-platform/backend/scripts/generate_docx.py",
	}
	for _, c := range candidates {
		if st, e := os.Stat(c); e == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("找不到 generate_docx.py")
}

func findGeneratePptxScript() (string, error) {
	candidates := []string{
		filepath.Join("scripts", "generate_pptx.py"),
		filepath.Join("..", "scripts", "generate_pptx.py"),
		"/Users/LIANJIFU/ops/digital-employee-platform/backend/scripts/generate_pptx.py",
	}
	for _, c := range candidates {
		if st, e := os.Stat(c); e == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("找不到 generate_pptx.py")
}

func normalizePptxTitle(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.Trim(s, "《》「」『』\"'`")
	s = regexp.MustCompile(`(?i)^skill[_-]?pptx[_-]*`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`(?i)(\.pptx|_pptx)$`).ReplaceAllString(s, "")
	s = reMultiSpace.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	if s == "" || strings.EqualFold(s, "pptx") || strings.EqualFold(s, "ppt") || s == "生成ppt" || s == "演示文稿" {
		return "演示文稿"
	}
	runes := []rune(s)
	if len(runes) > 40 {
		s = string(runes[:40])
	}
	return strings.TrimSpace(s)
}

func pptxDownloadBasename(title string) string {
	title = normalizePptxTitle(title)
	var b strings.Builder
	for _, r := range title {
		switch {
		case unicode.Is(unicode.Han, r):
			b.WriteRune(r)
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
		case r == '-' || r == '·':
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "presentation"
	}
	return out + ".pptx"
}

func pptxStorageName(downloadName string) string {
	base := strings.TrimSuffix(downloadName, filepath.Ext(downloadName))
	id := fmt.Sprintf("%x", time.Now().UnixNano())
	if len(id) > 12 {
		id = id[len(id)-12:]
	}
	return id + "-" + base + ".pptx"
}

var reSkillXlsxPrefix = regexp.MustCompile(`(?i)^skill[_-]?xlsx[_-]*`)

func normalizeXlsxTitle(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.Trim(s, "《》「」『》\"'`")
	s = reSkillXlsxPrefix.ReplaceAllString(s, "")
	s = regexp.MustCompile(`(?i)(\.xlsx|_xlsx)$`).ReplaceAllString(s, "")
	s = reMultiSpace.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	if s == "" || strings.EqualFold(s, "xlsx") || s == "表格" || s == "excel" {
		return "数据明细"
	}
	runes := []rune(s)
	if len(runes) > 32 {
		s = string(runes[:32])
	}
	return strings.TrimSpace(s)
}

func xlsxDownloadBasename(title string) string {
	title = normalizeXlsxTitle(title)
	var b strings.Builder
	for _, r := range title {
		switch {
		case unicode.Is(unicode.Han, r):
			b.WriteRune(r)
		case (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
		case r == '-' || r == '·':
			b.WriteRune(r)
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "spreadsheet"
	}
	return out + ".xlsx"
}

func xlsxStorageName(downloadName string) string {
	base := strings.TrimSuffix(downloadName, filepath.Ext(downloadName))
	id := fmt.Sprintf("%x", time.Now().UnixNano())
	if len(id) > 12 {
		id = id[len(id)-12:]
	}
	return id + "-" + base + ".xlsx"
}

func xlsxDisplayNameFromStorage(storage string) string {
	name := filepath.Base(strings.TrimSpace(storage))
	if reArtifactIDPref.MatchString(name) {
		rest := reArtifactIDPref.ReplaceAllString(name, "")
		if rest != "" {
			return xlsxDownloadBasename(rest)
		}
	}
	return xlsxDownloadBasename(name)
}

func findGenerateXlsxScript() (string, error) {
	candidates := []string{
		filepath.Join("..", "..", "builtin", "skills", "spreadsheets", "scripts", "spreadsheet.sh"),
		"/Users/LIANJIFU/ops/digital-employee-platform/backend/builtin/skills/spreadsheets/scripts/spreadsheet.sh",
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append([]string{
			filepath.Join(wd, "..", "..", "builtin", "skills", "spreadsheets", "scripts", "spreadsheet.sh"),
			filepath.Join(wd, "builtin", "skills", "spreadsheets", "scripts", "spreadsheet.sh"),
		}, candidates...)
	}
	for _, c := range candidates {
		if st, e := os.Stat(c); e == nil && !st.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs, nil
		}
	}
	return "", fmt.Errorf("找不到 spreadsheet.sh")
}

// generateXlsxArtifactLocal builds an .xlsx via the spreadsheet skill CLI (markdown table → xlsx).
func generateXlsxArtifactLocal(title, content string) (storageName, downloadPath string, err error) {
	cleanupSkillArtifactsTTL(7*24*time.Hour, 400)
	dir := skillArtifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	displayTitle := normalizeXlsxTitle(title)
	downloadName := xlsxDownloadBasename(displayTitle)
	storageName = xlsxStorageName(downloadName)
	outPath := filepath.Join(dir, storageName)

	// Save content to temp file for build
	contentFile, err := os.CreateTemp("", "de-xlsx-*.md")
	if err != nil {
		return "", "", err
	}
	contentPath := contentFile.Name()
	defer os.Remove(contentPath)
	if _, err := contentFile.WriteString(content); err != nil {
		_ = contentFile.Close()
		return "", "", err
	}
	_ = contentFile.Close()

	scriptPath, err := findGenerateXlsxScript()
	if err != nil {
		return "", "", err
	}
	cmd := exec.Command("bash", scriptPath, "build", "--title", displayTitle, "--spec", contentPath, "--out", outPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		// Fallback: produce a minimal xlsx-shaped placeholder so artifact path still resolves.
		// The preview path will report the stub.
		return "", "", fmt.Errorf("xlsx 生成失败: %v (%s)", err, truncateRunes(string(out), 240))
	}
	if st, statErr := os.Stat(outPath); statErr != nil || st.Size() < 100 {
		return "", "", fmt.Errorf("xlsx 产物无效")
	}
	downloadPath = "/api/skill-artifacts/" + storageName
	return storageName, downloadPath, nil
}

// previewXlsxArtifact shells out to spreadsheet.sh inspect to get a JSON preview.
func previewXlsxArtifact(storageName string) (map[string]any, error) {
	storageName = skillArtifactStorageName(storageName)
	if storageName == "" || !strings.HasSuffix(strings.ToLower(storageName), ".xlsx") {
		return nil, fmt.Errorf("无效 xlsx 产物名")
	}
	if !skillArtifactExists(storageName) {
		return nil, fmt.Errorf("产物不存在")
	}
	scriptPath, err := findGenerateXlsxScript()
	if err != nil {
		return nil, err
	}
	path := skillArtifactFilePath(storageName)
	tmpJSON, err := os.CreateTemp("", "de-xlsx-preview-*.json")
	if err != nil {
		return nil, err
	}
	tmpPath := tmpJSON.Name()
	_ = tmpJSON.Close()
	defer os.Remove(tmpPath)

	cmd := exec.Command("bash", scriptPath, "inspect", "--input", path, "--out", tmpPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("xlsx 预览失败: %v (%s)", err, truncateRunes(string(out), 240))
	}
	raw, rerr := os.ReadFile(tmpPath)
	if rerr != nil {
		return nil, fmt.Errorf("xlsx 预览读取失败: %w", rerr)
	}
	var payload map[string]any
	if jerr := json.Unmarshal(raw, &payload); jerr != nil {
		return nil, fmt.Errorf("xlsx 预览解析失败: %w", jerr)
	}
	payload["filename"] = storageName
	payload["downloadName"] = xlsxDisplayNameFromStorage(storageName)
	payload["kind"] = "xlsx"
	return payload, nil
}

func findGeneratePptxProdScript() (string, error) {
	candidates := []string{
		filepath.Join("scripts", "generate_pptx_prod.sh"),
		filepath.Join("..", "scripts", "generate_pptx_prod.sh"),
		"/Users/LIANJIFU/ops/digital-employee-platform/backend/scripts/generate_pptx_prod.sh",
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append([]string{
			filepath.Join(wd, "scripts", "generate_pptx_prod.sh"),
			filepath.Join(wd, "..", "scripts", "generate_pptx_prod.sh"),
		}, candidates...)
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs, nil
		}
	}
	return "", fmt.Errorf("找不到 generate_pptx_prod.sh")
}

func generatePptxArtifactLocal(title, content string) (storageName, downloadPath string, err error) {
	cleanupSkillArtifactsTTL(7*24*time.Hour, 400)
	dir := skillArtifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	displayTitle := normalizePptxTitle(title)
	downloadName := pptxDownloadBasename(displayTitle)
	storageName = pptxStorageName(downloadName)
	outPath := filepath.Join(dir, storageName)

	contentFile, err := os.CreateTemp("", "de-pptx-*.txt")
	if err != nil {
		return "", "", err
	}
	contentPath := contentFile.Name()
	defer os.Remove(contentPath)
	if _, err := contentFile.WriteString(content); err != nil {
		_ = contentFile.Close()
		return "", "", err
	}
	_ = contentFile.Close()

	// Prefer PilotDeck layout-library (production). Fall back to stdlib OOXML.
	if prodScript, perr := findGeneratePptxProdScript(); perr == nil {
		cmd := exec.Command("bash", prodScript, "--out", outPath, "--title", displayTitle, "--outline-file", contentPath)
		out, cerr := cmd.CombinedOutput()
		if cerr == nil {
			if verr := validatePptxOOXMLLoose(outPath); verr == nil {
				downloadPath = "/api/skill-artifacts/" + storageName
				return storageName, downloadPath, nil
			}
			_ = os.Remove(outPath)
		} else {
			// keep going to python fallback; log truncated reason in error only if both fail
			_ = out
		}
	}

	scriptPath, err := findGeneratePptxScript()
	if err != nil {
		return "", "", err
	}
	cmd := exec.Command("python3", scriptPath, "--out", outPath, "--title", displayTitle, "--content-file", contentPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("pptx 生成失败: %v (%s)", err, truncateRunes(string(out), 240))
	}
	if err := validatePptxOOXML(outPath); err != nil {
		_ = os.Remove(outPath)
		return "", "", err
	}
	downloadPath = "/api/skill-artifacts/" + storageName
	return storageName, downloadPath, nil
}

func formatPptxToolOutput(displayTitle, storageName, downloadPath string, localFallback bool) string {
	downloadName := strings.TrimPrefix(storageName, "")
	if i := strings.Index(storageName, "-"); i > 0 && i < len(storageName)-1 {
		downloadName = storageName[i+1:]
	}
	title := normalizePptxTitle(displayTitle)
	suffix := ""
	if localFallback {
		suffix = "（本地回退）"
	}
	return fmt.Sprintf(
		"已生成 PPT 文档「%s」%s\n文件名：%s\n下载链接：%s\n请把下载链接发给用户，不要改写文件名或链接。",
		title, suffix, downloadName, downloadPath,
	)
}

func looksLikePptxGenerateRequest(msg string) bool {
	m := strings.ToLower(strings.TrimSpace(msg))
	if m == "" {
		return false
	}
	hasPPT := strings.Contains(m, "ppt") || strings.Contains(m, "pptx") || strings.Contains(msg, "幻灯") || strings.Contains(msg, "演示文稿")
	hasGen := strings.Contains(msg, "生成") || strings.Contains(msg, "做一") || strings.Contains(msg, "制作") || strings.Contains(msg, "输出")
	return hasPPT && hasGen
}

func inferPptxTitleFromMessage(msg string) string {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return ""
	}
	for _, re := range []*regexp.Regexp{
		regexp.MustCompile(`《([^》]{2,32})》`),
		regexp.MustCompile(`「([^」]{2,32})」`),
		regexp.MustCompile(`生成[一份套]*[《「"]?([^《」"\s，。！？,]{2,28})`),
	} {
		if m := re.FindStringSubmatch(msg); len(m) == 2 {
			t := normalizePptxTitle(m[1])
			t = strings.TrimSuffix(t, "PPT")
			t = strings.TrimSuffix(t, "ppt")
			t = strings.TrimSpace(t)
			if t != "" && t != "演示文稿" {
				return t
			}
		}
	}
	if strings.Contains(msg, "季度考评") || strings.Contains(msg, "季度考核") {
		return "团队季度考评"
	}
	if strings.Contains(msg, "述职") {
		return "述职汇报"
	}
	return ""
}

func defaultPptxOutlineForMessage(title, userMsg string) string {
	t := coalesce(normalizePptxTitle(title), "演示文稿")
	if strings.Contains(userMsg, "季度考评") || strings.Contains(userMsg, "季度考核") {
		return fmt.Sprintf(`# %s汇报

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述，不要照抄通用模板。

汇报人：（请填写）
考评周期：（请填写）年第（请填写）季度
汇报日期：（请填写）年（请填写）月（请填写）日

## 目录
- 一、团队概况
- 二、KPI 指标总览
- 三、KPI 达成分析
- 四、重点项目进展
- 五、亮点与问题
- 六、改进措施
- 七、下季度工作计划
- 八、总结

## 一、团队概况
- 团队人数：（请填写）人
- 本季度入职 / 离职：（请填写）/（请填写）
- 核心成员变动：（请填写）

## 二、KPI 指标总览
- 指标1：目标（请填写）/ 实际（请填写）/ 完成率（请填写）%%
- 指标2：目标（请填写）/ 实际（请填写）/ 完成率（请填写）%%
- 综合完成率：（请填写）%%

## 三、KPI 达成分析
- 已达成指标与关键动作
- 未达成指标及原因
- 关键差分析与纠偏

## 四、重点项目进展
- 项目A：进度 / 风险 / 下一步
- 项目B：进度 / 风险 / 下一步

## 五、亮点与问题
- 亮点：可复制的最佳实践
- 问题：需优先解决的阻塞项

## 六、改进措施
- 措施1（负责人 / 截止时间）
- 措施2（负责人 / 截止时间）

## 七、下季度工作计划
- 目标与关键里程碑
- 资源与协同诉求

## 八、总结
- 本季度结论
- 需决策 / 需支持事项`, t)
	}
	return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

副标题：业务汇报材料
汇报人 / 日期：（请填写）/（请填写）年（请填写）月（请填写）日

## 目录
- 背景与目标
- 核心内容
- 总结与下一步

## 背景与目标
- 背景说明
- 本次目标与成功标准

## 核心内容
- 要点一
- 要点二
- 要点三

## 总结与下一步
- 结论
- 行动项与负责人`, t)
}

func hasPptxArtifactText(text string) bool {
	low := strings.ToLower(text)
	return strings.Contains(low, ".pptx") && strings.Contains(text, "/api/skill-artifacts/")
}

func pptxRelatedToolAttempted(toolCalls []map[string]any) bool {
	for _, tc := range toolCalls {
		name := strings.ToLower(str(tc["name"]))
		if isPptxSkillName(name) || name == "write_file" || name == "bash" || name == "execute_code" || name == "skill.read" {
			return true
		}
		args, _ := tc["args"].(map[string]any)
		path := strings.ToLower(coalesce(str(args["path"]), coalesce(str(args["command"]), str(args["skill"]))))
		if strings.Contains(path, "pptx") || strings.Contains(path, "ppt") || strings.Contains(path, ".mjs") || strings.Contains(path, ".copilot-ws") {
			return true
		}
	}
	return false
}

func loadDocxPreviewPayload(storageName string) (map[string]any, error) {
	storageName = skillArtifactStorageName(storageName)
	if storageName == "" {
		return nil, fmt.Errorf("无效产物名")
	}
	if !skillArtifactExists(storageName) {
		return nil, fmt.Errorf("产物不存在")
	}
	scriptPath, err := findGenerateDocxScript()
	if err != nil {
		return nil, err
	}
	path := skillArtifactFilePath(storageName)
	cmd := exec.Command("python3", scriptPath, "--preview-json", path)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("docx 预览失败: %v (%s)", err, truncateRunes(string(out), 240))
	}
	var payload map[string]any
	if err := json.Unmarshal(out, &payload); err != nil {
		return nil, fmt.Errorf("docx 预览解析失败: %w", err)
	}
	payload["filename"] = storageName
	payload["downloadName"] = docxDisplayNameFromStorage(storageName)
	return payload, nil
}

func previewDocxArtifact(storageName string) (map[string]any, error) {
	payload, err := loadDocxPreviewPayload(storageName)
	if err != nil {
		return nil, err
	}
	if docxPreviewLooksLikeCode(payload) || docxPreviewLooksLikePlaceholder(payload) {
		return nil, fmt.Errorf("文档正文异常（疑似占位符或脚本），请重新生成")
	}
	payload["kind"] = "docx"
	return payload, nil
}

var pptxSlideTextRE = regexp.MustCompile(`(?s)<a:t[^>]*>([^<]*)</a:t>`)
var pptxParaRE = regexp.MustCompile(`(?s)<a:p\b[^>]*>(.*?)</a:p>`)
var pptxBuCharRE = regexp.MustCompile(`(?i)<a:buChar\b`)

func inferTitleFromPptxStorage(storageName string) string {
	base := strings.TrimSuffix(filepath.Base(storageName), filepath.Ext(storageName))
	base = reArtifactIDPref.ReplaceAllString(base, "")
	return strings.TrimSpace(base)
}

func generateDocxArtifactLocal(title, content string) (storageName, downloadPath string, err error) {
	return generateDocxArtifactLocalNamed(title, content, "")
}

func generateDocxArtifactLocalNamed(title, content, preferredStorage string) (storageName, downloadPath string, err error) {
	content = sanitizeDocxBody(content)
	if content == "" {
		return "", "", fmt.Errorf("docx 正文无效：请提供文档内容，不要传入生成脚本")
	}
	dir := skillArtifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	displayTitle := normalizeDocxTitle(title)
	downloadName := docxDownloadBasename(displayTitle)
	preferredStorage = skillArtifactStorageName(preferredStorage)
	if preferredStorage != "" && strings.HasSuffix(strings.ToLower(preferredStorage), ".docx") {
		storageName = preferredStorage
	} else {
		storageName = docxStorageName(downloadName)
	}
	outPath := filepath.Join(dir, storageName)

	scriptPath, err := findGenerateDocxScript()
	if err != nil {
		return "", "", err
	}

	contentFile, err := os.CreateTemp("", "de-docx-*.txt")
	if err != nil {
		return "", "", err
	}
	contentPath := contentFile.Name()
	defer os.Remove(contentPath)
	if _, err := contentFile.WriteString(content); err != nil {
		_ = contentFile.Close()
		return "", "", err
	}
	_ = contentFile.Close()

	cmd := exec.Command("python3", scriptPath, "--out", outPath, "--title", displayTitle, "--content-file", contentPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("docx 生成失败: %v (%s)", err, truncateRunes(string(out), 240))
	}
	downloadPath = "/api/skill-artifacts/" + storageName
	return storageName, downloadPath, nil
}

func asciiFallbackFilename(name string) string {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	var b strings.Builder
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		} else if unicode.IsSpace(r) {
			b.WriteByte('_')
		}
	}
	out := strings.Trim(b.String(), "._-")
	out = reMultiUnderscore.ReplaceAllString(out, "_")
	if out == "" {
		out = "download"
	}
	if ext == "" {
		ext = ".bin"
	}
	return out + ext
}

func contentDispositionAttachment(name string) string {
	// Prefer clean download basename (no storage id / skill_docx noise).
	display := name
	if strings.HasSuffix(strings.ToLower(name), ".docx") {
		display = docxDisplayNameFromStorage(name)
	} else if strings.HasSuffix(strings.ToLower(name), ".pptx") {
		if i := strings.Index(name, "-"); i > 0 && i < len(name)-1 {
			display = name[i+1:]
		}
	} else if strings.HasSuffix(strings.ToLower(name), ".pdf") {
		if i := strings.Index(name, "-"); i > 0 && i < len(name)-1 {
			display = name[i+1:]
		}
	}
	ascii := asciiFallbackFilename(display)
	return fmt.Sprintf(
		"attachment; filename=\"%s\"; filename*=UTF-8''%s",
		ascii,
		url.PathEscape(display),
	)
}

func (s *Server) serveSkillArtifactPreview(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/skill-artifacts/")
	path = strings.TrimSuffix(path, "/preview")
	name := filepath.Base(strings.TrimSpace(path))
	if decoded, err := url.PathUnescape(name); err == nil && decoded != "" {
		name = decoded
	}
	name = skillArtifactStorageName(name)
	if name == "" {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "无效产物名"))
		return
	}
	low := strings.ToLower(name)
	switch {
	case strings.HasSuffix(low, ".docx"):
		payload, err := previewDocxArtifact(name)
		if err != nil {
			writeErr(w, apperr.NotFoundErr(apperr.NotFound, err.Error()))
			return
		}
		writeJSON(w, payload)
	case strings.HasSuffix(low, ".pptx"):
		payload, err := previewPptxArtifact(name)
		if err != nil {
			writeErr(w, apperr.NotFoundErr(apperr.NotFound, err.Error()))
			return
		}
		writeJSON(w, payload)
	case strings.HasSuffix(low, ".xlsx"):
		payload, err := previewXlsxArtifact(name)
		if err != nil {
			writeErr(w, apperr.NotFoundErr(apperr.NotFound, err.Error()))
			return
		}
		writeJSON(w, payload)
	case strings.HasSuffix(low, ".pdf"):
		payload, err := previewPdfArtifact(name)
		if err != nil {
			writeErr(w, apperr.NotFoundErr(apperr.NotFound, err.Error()))
			return
		}
		writeJSON(w, payload)
	default:
		writeErr(w, apperr.BadReq(apperr.BadRequest, "该文件类型暂不支持在线预览，请下载后打开"))
	}
}

func writeJSON(w http.ResponseWriter, payload any) {
	response.OK(w, payload)
}

func (s *Server) serveSkillArtifact(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/skill-artifacts/")
	if decoded, err := url.PathUnescape(name); err == nil && decoded != "" {
		name = decoded
	}
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Trim(name, "`\"'")
	if name == "" || name == "." || name == ".." {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "无效产物名"))
		return
	}
	root := filepath.Clean(skillArtifactDir())
	path := filepath.Clean(filepath.Join(root, name))
	if path != filepath.Join(root, name) && !strings.HasPrefix(path, root+string(os.PathSeparator)) {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "无效产物路径"))
		return
	}
	if st, err := os.Stat(path); err != nil || st.IsDir() {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, "产物不存在"))
		return
	}
	if strings.HasSuffix(strings.ToLower(name), ".docx") {
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	} else if strings.HasSuffix(strings.ToLower(name), ".pptx") {
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
	} else if strings.HasSuffix(strings.ToLower(name), ".xlsx") {
		w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	} else if strings.HasSuffix(strings.ToLower(name), ".pdf") {
		w.Header().Set("Content-Type", "application/pdf")
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	w.Header().Set("Content-Disposition", contentDispositionAttachment(name))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, path)
}

func formatDocxToolOutput(displayTitle, storageName, downloadPath string, localFallback bool) string {
	downloadName := docxDisplayNameFromStorage(storageName)
	title := normalizeDocxTitle(displayTitle)
	suffix := ""
	if localFallback {
		suffix = "（本地回退）"
	}
	return fmt.Sprintf(
		"已生成 Word 文档「%s」%s\n文件名：%s\n下载链接：%s\n请把下载链接发给用户，不要改写文件名或链接。",
		title, suffix, downloadName, downloadPath,
	)
}

// inferDocxTitleFromMessage extracts a short document title from user intent.
func inferDocxTitleFromMessage(msg string) string {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return ""
	}
	// 《招聘岗位模板》 / “岗位说明书”
	for _, re := range []*regexp.Regexp{
		regexp.MustCompile(`《([^》]{2,32})》`),
		regexp.MustCompile(`「([^」]{2,32})」`),
		regexp.MustCompile(`生成[一份张]*[《「"]?([^《」"\s，。！？,]{2,24})`),
	} {
		if m := re.FindStringSubmatch(msg); len(m) == 2 {
			if t := normalizeDocxTitle(m[1]); t != "生成文档" {
				return t
			}
		}
	}
	lower := msg
	if strings.Contains(lower, "招聘") && (strings.Contains(lower, "岗位") || strings.Contains(lower, "模板") || strings.Contains(lower, "JD")) {
		return "招聘岗位模板"
	}
	if strings.Contains(lower, "岗位说明") {
		return "岗位说明书"
	}
	return ""
}

func isSpreadsheetSkillName(name string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	return n == "xlsx" || n == "spreadsheets" || n == "spreadsheet" ||
		n == "excel" || strings.Contains(n, "spreadsheet") || n == "表格生成"
}

func inferXlsxTitleFromMessage(msg string) string {
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return ""
	}
	for _, re := range []*regexp.Regexp{
		regexp.MustCompile(`《([^》]{2,32})》`),
		regexp.MustCompile(`「([^」]{2,32})」`),
		regexp.MustCompile(`生成[一份张]*[《「"]?([^《」"\s，。！？,]{2,24})`),
	} {
		if m := re.FindStringSubmatch(msg); len(m) == 2 {
			t := strings.TrimSpace(m[1])
			if t != "" && t != "表格" {
				return t
			}
		}
	}
	if strings.Contains(msg, "预算") {
		return "预算明细"
	}
	if strings.Contains(msg, "考勤") {
		return "考勤明细"
	}
	if strings.Contains(msg, "花名册") || strings.Contains(msg, "人员名单") {
		return "人员花名册"
	}
	return ""
}

// defaultDocxOutlineForMessage produces a structured Word outline when the model did not
// supply content. Mirrors defaultPptxOutlineForMessage (skill_artifacts.go:744) so Word
// tasks without explicit body still generate multi-section documents instead of 1-page stubs.
func defaultDocxOutlineForMessage(title, userMsg string) string {
	t := coalesce(strings.TrimSpace(title), "生成文档")
	if strings.Contains(userMsg, "招聘") {
		return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述，不要照抄通用模板。

## 一、岗位基本信息
- 岗位名称：
- 所属部门：
- 直接上级：
- 岗位编号：

## 二、岗位职责
- 职责一：
- 职责二：
- 职责三：

## 三、任职要求
- 学历 / 专业：
- 工作经验：
- 核心能力：

## 四、薪资福利
- 薪资范围：
- 福利体系：

## 五、备注
- 补充说明：`, t)
	}
	if strings.Contains(userMsg, "岗位说明") {
		return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

## 一、岗位标识
- 岗位名称：
- 所属部门：
- 岗位级别：

## 二、岗位概述
- 岗位目的：
- 工作关系：

## 三、岗位职责
- 关键职责一：
- 关键职责二：
- 关键职责三：

## 四、任职资格
- 教育背景：
- 经验要求：
- 专业技能：

## 五、发展通道
- 晋升方向：`, t)
	}
	return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

## 一、概述
- 背景说明：
- 适用范围：

## 二、核心内容
- 要点一：
- 要点二：
- 要点三：

## 三、流程与标准
- 流程描述：
- 验收标准：

## 四、附则
- 解释权：
- 生效日期：`, t)
}

// defaultXlsxOutlineForMessage produces a structured Excel outline (markdown table seed)
// when the model did not supply content. The spreadsheet skill consumes markdown tables.
func defaultXlsxOutlineForMessage(title, userMsg string) string {
	t := coalesce(strings.TrimSpace(title), "数据明细")
	if strings.Contains(userMsg, "预算") {
		return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

| 项目 | 类别 | 金额（元） | 负责人 | 备注 |
| --- | --- | --- | --- | --- |
| 收入预算 | 主营收入 |  |  |  |
| 成本预算 | 人力成本 |  |  |  |
| 成本预算 | 运营成本 |  |  |  |
| 利润预算 | 净利润 |  |  |  |

## 说明
- 数据周期：
- 口径：
- 复核人：`, t)
	}
	if strings.Contains(userMsg, "考勤") {
		return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

| 员工 | 部门 | 出勤天数 | 迟到 | 早退 | 请假 | 加班 |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## 说明
- 统计周期：
- 异常处理：`, t)
	}
	return fmt.Sprintf(`# %s

【指令】禁止使用占位符；每个 H2 必须给出 2-3 句实际描述。

| 序号 | 名称 | 分类 | 数量 | 单位 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## 说明
- 数据来源：
- 责任人：`, t)
}
