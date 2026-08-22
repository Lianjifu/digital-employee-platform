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
	reSkillDocxPrefix = regexp.MustCompile(`(?i)^skill[_-]?docx[_-]*`)
	reDocxSuffix      = regexp.MustCompile(`(?i)(_docx|\.docx)$`)
	reArtifactIDPref  = regexp.MustCompile(`(?i)^[a-z0-9]{6,12}-`)
	reMultiSpace      = regexp.MustCompile(`\s+`)
	reMultiUnderscore = regexp.MustCompile(`_+`)
)

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
	if preferredStorage != "" && skillArtifactExists(preferredStorage) {
		return preferredStorage, "/api/skill-artifacts/" + preferredStorage, nil
	}
	if preferredStorage != "" {
		if fetchErr := fetchSkillArtifactFromRuntime(preferredStorage); fetchErr == nil && skillArtifactExists(preferredStorage) {
			return preferredStorage, "/api/skill-artifacts/" + preferredStorage, nil
		}
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

// ensureSkillArtifactsInOutput materializes missing .docx artifacts referenced in tool output.
func ensureSkillArtifactsInOutput(output, title, content string) string {
	if strings.TrimSpace(output) == "" {
		return output
	}
	re := regexp.MustCompile(`/api/skill-artifacts/([^\s)\]"'` + "`" + `<>]+)`)
	matches := re.FindAllStringSubmatch(output, -1)
	if len(matches) == 0 {
		return output
	}
	displayTitle := normalizeDocxTitle(title)
	body := strings.TrimSpace(content)
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		storage := skillArtifactStorageName(m[1])
		if storage == "" || !strings.HasSuffix(strings.ToLower(storage), ".docx") {
			continue
		}
		if skillArtifactExists(storage) {
			continue
		}
		ensured, download, err := ensureDocxArtifactOnDisk(displayTitle, body, storage)
		if err != nil {
			continue
		}
		output = replaceSkillArtifactPath(output, storage, ensured)
		if download != "" {
			_ = download
		}
	}
	return output
}

func resolveDocxBodyFromExecution(args map[string]any, userMessage, output string, plan map[string]any) string {
	if args != nil {
		if body := strings.TrimSpace(coalesce(str(args["content"]), str(args["input"]))); body != "" {
			return body
		}
	}
	if plan != nil {
		for _, st := range skillTurnSteps(plan) {
			stepArgs, _ := st["args"].(map[string]any)
			if stepArgs == nil {
				continue
			}
			if body := strings.TrimSpace(coalesce(str(stepArgs["content"]), str(stepArgs["input"]))); body != "" {
				return body
			}
		}
	}
	if body := extractDocxBodyFromSkillOutput(output); body != "" {
		return body
	}
	return strings.TrimSpace(userMessage)
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

func previewDocxArtifact(storageName string) (map[string]any, error) {
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

func generateDocxArtifactLocal(title, content string) (storageName, downloadPath string, err error) {
	dir := skillArtifactDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	displayTitle := normalizeDocxTitle(title)
	downloadName := docxDownloadBasename(displayTitle)
	storageName = docxStorageName(downloadName)
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
	if name == "" || !strings.HasSuffix(strings.ToLower(name), ".docx") {
		writeErr(w, apperr.BadReq(apperr.BadRequest, "仅支持 .docx 预览"))
		return
	}
	payload, err := previewDocxArtifact(name)
	if err != nil {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, err.Error()))
		return
	}
	writeJSON(w, payload)
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
