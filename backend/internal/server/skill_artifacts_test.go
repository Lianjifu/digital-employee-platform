package server

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestNormalizeDocxTitle(t *testing.T) {
	cases := map[string]string{
		"skill_docx__输出招聘模板_docx": "输出招聘模板",
		"《招聘岗位模板》":                "招聘岗位模板",
		"abc123-招聘岗位模板.docx":      "招聘岗位模板",
		"docx":                    "生成文档",
	}
	for in, want := range cases {
		if got := normalizeDocxTitle(in); got != want {
			t.Fatalf("normalizeDocxTitle(%q)=%q want %q", in, got, want)
		}
	}
}

func TestDocxDownloadBasename(t *testing.T) {
	got := docxDownloadBasename("skill_docx__输出招聘模板_docx")
	if got != "输出招聘模板.docx" {
		t.Fatalf("basename=%s", got)
	}
	if strings.Contains(got, "skill") || strings.Contains(got, "_") {
		t.Fatalf("polluted basename: %s", got)
	}
}

func TestGenerateDocxArtifactLocal(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	filename, download, err := generateDocxArtifactLocal(
		"skill_docx__招聘岗位模板_docx",
		"一、基本信息\n岗位名称：人事专员\n\n二、岗位职责\n1. 负责招聘\n\n三、任职资格\n1. 本科及以上\n\n四、其他说明\n薪资面议",
	)
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasSuffix(filename, "-招聘岗位模板.docx") {
		t.Fatalf("storage filename=%s", filename)
	}
	if download != "/api/skill-artifacts/"+filename {
		t.Fatalf("download=%s", download)
	}
	if display := docxDisplayNameFromStorage(filename); display != "招聘岗位模板.docx" {
		t.Fatalf("display=%s", display)
	}
	st, err := os.Stat(filepath.Join(dir, filename))
	if err != nil || st.Size() < 1000 {
		t.Fatalf("artifact missing or too small: %v size=%v", err, st)
	}
}

func TestContentDispositionAttachment(t *testing.T) {
	got := contentDispositionAttachment("1ecc2aef2257-skill_docx__输出招聘模版_docx.docx")
	if !strings.Contains(got, "filename*=UTF-8''") {
		t.Fatalf("missing RFC5987 filename*: %s", got)
	}
	if !strings.Contains(got, "%E8%BE%93%E5%87%BA") && !strings.Contains(got, "输出") {
		// PathEscape of 输出招聘模版.docx
		if !strings.Contains(got, "docx") {
			t.Fatalf("unexpected disposition: %s", got)
		}
	}
	idx := strings.Index(got, `filename="`)
	rest := got[idx+len(`filename="`):]
	end := strings.Index(rest, `"`)
	quoted := rest[:end]
	for _, r := range quoted {
		if r > 127 {
			t.Fatalf("non-ascii in filename=: %s", got)
		}
	}
}

func TestLooksLikeCodeAsDocxBody(t *testing.T) {
	code := `from docx import Document
doc = Document()
doc.add_heading('test', level=0)`
	if !looksLikeCodeAsDocxBody(code) {
		t.Fatal("expected code detection")
	}
	if looksLikeCodeAsDocxBody("一、岗位职责\n1. 招聘人事") {
		t.Fatal("expected prose to pass")
	}
}

func TestSanitizeDocxBodyRejectsScript(t *testing.T) {
	if sanitizeDocxBody("from docx import Document") != "" {
		t.Fatal("script should sanitize to empty")
	}
}

func TestEnsureSkillArtifactsSkipsCodeBody(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	missing := "abc123-test.docx"
	output := "下载链接：/api/skill-artifacts/" + missing
	got := ensureSkillArtifactsInOutput(output, "测试", "from docx import Document")
	if strings.Contains(got, missing) && skillArtifactExists(missing) {
		t.Fatal("should not materialize code body")
	}
}

func TestInferDocxTitleFromMessage(t *testing.T) {
	if got := inferDocxTitleFromMessage("请生成《招聘岗位模板》Word 文档"); got != "招聘岗位模板" {
		t.Fatalf("got %q", got)
	}
	if got := inferDocxTitleFromMessage("帮我出一份招聘岗位 JD 模板"); got != "招聘岗位模板" {
		t.Fatalf("got %q", got)
	}
}

func TestEnsureSkillArtifactsInOutput(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	missing := "abc123-招聘岗位模板.docx"
	output := "已生成 Word 文档\n下载链接：/api/skill-artifacts/" + missing
	got := ensureSkillArtifactsInOutput(output, "招聘岗位模板", "一、基本信息\n岗位名称：人事专员")
	if !strings.Contains(got, "/api/skill-artifacts/") {
		t.Fatalf("missing link: %s", got)
	}
	re := regexp.MustCompile(`/api/skill-artifacts/([^\s]+)`)
	m := re.FindStringSubmatch(got)
	if len(m) < 2 {
		t.Fatalf("no storage in %s", got)
	}
	st, err := os.Stat(filepath.Join(dir, m[1]))
	if err != nil || st.Size() < 500 {
		t.Fatalf("artifact not materialized: %v", err)
	}
}

func TestExtractDocxBodyFromSkillOutput(t *testing.T) {
	output := "【Skill Turn】\n\n—— 授权后执行结果 ——\n\n—— 步骤 run ——\n一、岗位职责\n1. 招聘\n\n已生成 Word 文档"
	got := extractDocxBodyFromSkillOutput(output)
	if !strings.Contains(got, "一、岗位职责") {
		t.Fatalf("got %q", got)
	}
}

func TestLooksLikeDocxPlaceholderBody(t *testing.T) {
	placeholder := "title=招聘人事招聘模板, content=按检索结果整理的可编辑招聘模板正文"
	if !looksLikeDocxPlaceholderBody(placeholder) {
		t.Fatal("expected placeholder detection")
	}
	full := "一、招聘信息\n岗位名称：人事专员\n\n二、岗位职责\n1. 负责招聘渠道维护"
	if looksLikeDocxPlaceholderBody(full) {
		t.Fatal("expected full template to pass")
	}
}

func TestExtractDocxBodyFromAssistantText(t *testing.T) {
	full := "招聘人事岗位招聘模板\n\n一、招聘信息\n岗位名称：人事专员\n\n文件名：x.docx\n下载链接：/api/skill-artifacts/abc.docx"
	got := extractDocxBodyFromAssistantText(full)
	if !strings.Contains(got, "一、招聘信息") || strings.Contains(got, "下载链接") {
		t.Fatalf("got %q", got)
	}
}

func TestResolveDocxBodyForTurnPrefersAssistant(t *testing.T) {
	full := "招聘模板\n\n一、招聘信息\n岗位名称：人事专员\n\n二、岗位职责\n1. 维护招聘渠道\n\n三、任职要求\n1. 本科及以上"
	toolCalls := []map[string]any{{
		"name": "docx", "status": "success",
		"args": map[string]any{"content": "title=招聘模板, content=按检索结果整理的可编辑招聘模板正文"},
	}}
	got := resolveDocxBodyForTurn(full, toolCalls, "生成招聘模板 word")
	if !strings.Contains(got, "一、招聘信息") {
		t.Fatalf("expected assistant body, got %q", got)
	}
}

func TestEnsureSkillArtifactsSyncsPlaceholderDocx(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("DE_SKILL_ARTIFACT_DIR", dir)
	storage := "abc123-招聘岗位模板.docx"
	placeholder := "title=招聘模板, content=按检索结果整理的可编辑招聘模板正文"
	if _, _, err := generateDocxArtifactLocal("招聘岗位模板", placeholder); err != nil {
		// placeholder may be rejected by sanitize - write file directly
		scriptPath, err := findGenerateDocxScript()
		if err != nil {
			t.Fatalf("script: %v", err)
		}
		outPath := filepath.Join(dir, storage)
		cmd := exec.Command("python3", scriptPath, "--out", outPath, "--title", "招聘岗位模板", "--content", placeholder)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("seed placeholder docx: %v %s", err, out)
		}
	} else {
		// rename generated file to storage name
		entries, _ := os.ReadDir(dir)
		for _, e := range entries {
			if strings.HasSuffix(e.Name(), ".docx") {
				_ = os.Rename(filepath.Join(dir, e.Name()), filepath.Join(dir, storage))
				break
			}
		}
	}
	goodBody := "一、招聘信息\n岗位名称：人事专员\n\n二、岗位职责\n1. 维护招聘渠道\n\n三、任职要求\n1. 本科及以上"
	output := "下载链接：/api/skill-artifacts/" + storage
	got := ensureSkillArtifactsInOutput(output, "招聘岗位模板", goodBody)
	if !strings.Contains(got, storage) {
		t.Fatalf("missing link: %s", got)
	}
	payload, err := previewDocxArtifact(storage)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	text := docxPreviewText(payload)
	if !strings.Contains(text, "一、招聘信息") {
		t.Fatalf("docx not synced, preview=%q", text)
	}
}

func TestIsDocxSkillName(t *testing.T) {
	if !isDocxSkillName("docx") || !isDocxSkillName("Word文档") {
		t.Fatal("expected docx names to match")
	}
	if isDocxSkillName("政策问答") {
		t.Fatal("policy skill should not match docx")
	}
}
