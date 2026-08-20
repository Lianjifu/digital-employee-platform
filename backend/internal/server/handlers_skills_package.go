package server

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/digital-employee-platform/backend/internal/auth"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) importSkillPackage(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if err := requireSkillWrite(id); err != nil {
		return nil, err
	}
	fileName, raw, err := readSkillPackageUpload(r)
	if err != nil {
		return nil, err
	}
	meta, files, err := parseSkillPackage(fileName, raw)
	if err != nil {
		return nil, apperr.BadReq(apperr.BadRequest, err.Error())
	}
	ws := s.workspaceID(r)
	skillID := ""
	s.Store.Lock()
	skillID = s.Store.ID("sk")
	s.Store.Unlock()

	dest, err := s.materializeSkillPackage(ws, skillID, meta.RootDir, files)
	if err != nil {
		return nil, apperr.BadReq(apperr.BadRequest, "落盘技能包失败: "+err.Error())
	}

	risk := meta.RiskLevel
	item := map[string]any{
		"id": skillID, "workspaceId": ws, "ownerId": id.ID, "owner": id.Name,
		"name": meta.Name, "kind": "skill",
		"description": meta.Description,
		"version":     meta.Version,
		"status":      ternary(risk == "high", "beta", "installed"),
		"rating":      0, "installCount": 0, "riskLevel": risk,
		"cacheable":       false,
		"lifecycleStatus": ternary(risk == "high", "pending_approval", "enabled"),
		"source":          "package", "environment": "sandbox", "classification": "internal",
		"lastVerifiedAt": "刚刚", "team": "当前工作区",
		"license": meta.License, "tags": meta.Tags,
		"signed": false, "publisher": id.Name,
		"packagePath": dest, "packageRoot": meta.RootDir,
		"skillMdPath": meta.SkillMDRel, "hasScripts": meta.HasScripts,
		"scripts": meta.Scripts, "packageFiles": meta.Files,
		"packageSha256": meta.SHA256, "packageSizeBytes": meta.SizeBytes,
		"packageFileName": fileName,
	}
	if len(meta.Entrypoints) > 0 {
		item["entrypoints"] = meta.Entrypoints
	} else if len(meta.Scripts) > 0 {
		item["entrypoints"] = meta.Scripts
	}
	if meta.ReadOnly != nil {
		item["readOnly"] = *meta.ReadOnly
	}
	if meta.ProducesArtifacts != nil {
		item["producesArtifacts"] = *meta.ProducesArtifacts
	}
	enrichSkillMetadata(item)

	s.Store.Lock()
	// replace same-name package skill in workspace
	kept := make([]map[string]any, 0, len(s.Store.Skills)+1)
	removedSkillIDs := make([]string, 0)
	for _, sk := range s.Store.Skills {
		if str(sk["workspaceId"]) == ws && str(sk["name"]) == meta.Name && str(sk["source"]) == "package" {
			if oid := str(sk["id"]); oid != "" && oid != skillID {
				removedSkillIDs = append(removedSkillIDs, oid)
			}
			oldPath := str(sk["packagePath"])
			if oldPath != "" && oldPath != dest {
				_ = os.RemoveAll(oldPath)
			}
			continue
		}
		kept = append(kept, sk)
	}
	removedHealthIDs := make([]string, 0)
	if len(removedSkillIDs) > 0 {
		drop := map[string]struct{}{}
		for _, id := range removedSkillIDs {
			drop[id] = struct{}{}
		}
		healthKept := make([]map[string]any, 0, len(s.Store.SkillHealth))
		for _, h := range s.Store.SkillHealth {
			if _, gone := drop[str(h["skillId"])]; gone {
				if hid := str(h["id"]); hid != "" {
					removedHealthIDs = append(removedHealthIDs, hid)
				}
				continue
			}
			healthKept = append(healthKept, h)
		}
		s.Store.SkillHealth = healthKept
	}
	s.Store.Skills = append([]map[string]any{item}, kept...)
	s.ensureSkillHealthLocked(item)
	s.ensureSkillPermissionsLocked(skillID)
	s.ensureSkillGovernanceLocked(skillID)
	s.ensureSkillRuntimeLocked(item)
	s.Store.SkillIntegrations = append([]map[string]any{{
		"id": s.Store.ID("si"), "workspaceId": ws, "name": meta.Name, "type": "skill",
		"skillId":     skillID,
		"environment": "test", "status": "enabled", "owner": id.Name,
		"endpoint":       "package://" + meta.Name + "@" + meta.Version,
		"credentialRef":  "vault://skills/" + skillID + "/runtime",
		"lastVerifiedAt": "刚刚", "health": "healthy",
		"discoveredCapabilities": len(meta.Scripts),
		"writeApprovalRequired":  risk == "high",
		"allowedEgress":          []string{},
	}}, s.Store.SkillIntegrations...)
	s.Store.AppendAudit(ws, id.Name, "导入技能包", meta.Name+"@"+meta.Version, "success", "sha256="+meta.SHA256+";scripts="+itoaPolicy(len(meta.Scripts)))
	s.Store.Unlock()
	if len(removedSkillIDs) > 0 {
		s.Store.PersistDelete("skills", removedSkillIDs...)
	}
	if len(removedHealthIDs) > 0 {
		s.Store.PersistDelete("skill_health", removedHealthIDs...)
	}
	s.persistSkills()
	go s.persistSkillExtra()

	out := normalizeSkillItem(item)
	out["packagePreview"] = map[string]any{
		"files": meta.Files, "scripts": meta.Scripts, "hasScripts": meta.HasScripts,
		"sha256": meta.SHA256, "markdownBytes": len(meta.Markdown),
	}
	return out, nil
}

func readSkillPackageUpload(r *http.Request) (fileName string, raw []byte, err error) {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxSkillPackageBytes + (1 << 20)); err != nil {
			return "", nil, apperr.BadReq(apperr.BadRequest, "无法解析上传表单")
		}
		file, hdr, err := r.FormFile("file")
		if err != nil {
			return "", nil, apperr.BadReq(apperr.BadRequest, "请上传 file 字段")
		}
		defer file.Close()
		raw, err = io.ReadAll(io.LimitReader(file, maxSkillPackageBytes+1))
		if err != nil {
			return "", nil, apperr.BadReq(apperr.BadRequest, "读取上传文件失败")
		}
		if len(raw) > maxSkillPackageBytes {
			return "", nil, apperr.BadReq(apperr.BadRequest, "技能包不能超过 10 MB")
		}
		return hdr.Filename, raw, nil
	}
	body, _ := decodeMap(r)
	fileName = strings.TrimSpace(str(body["fileName"]))
	b64 := strings.TrimSpace(str(body["contentBase64"]))
	if fileName == "" || b64 == "" {
		return "", nil, apperr.BadReq(apperr.BadRequest, "请上传 .skill / .zip / .tgz 文件（multipart file 或 contentBase64）")
	}
	raw, err = base64.StdEncoding.DecodeString(b64)
	if err != nil {
		// try raw URL encoding without padding issues
		raw, err = base64.RawStdEncoding.DecodeString(b64)
		if err != nil {
			return "", nil, apperr.BadReq(apperr.BadRequest, "contentBase64 无效")
		}
	}
	if len(raw) > maxSkillPackageBytes {
		return "", nil, apperr.BadReq(apperr.BadRequest, "技能包不能超过 10 MB")
	}
	return fileName, raw, nil
}

func (s *Server) skillPackageInfo(r *http.Request, id *auth.Identity, ws, skillID string) (any, error) {
	if err := requireSkillRead(id); err != nil {
		return nil, err
	}
	s.Store.RLock()
	defer s.Store.RUnlock()
	_, sk := s.findSkillLocked(ws, skillID)
	if sk == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "技能不存在")
	}
	pkgPath := str(sk["packagePath"])
	md := ""
	if pkgPath != "" {
		mdBytes, _ := os.ReadFile(filepath.Join(pkgPath, coalesce(str(sk["skillMdPath"]), "SKILL.md")))
		md = string(mdBytes)
	}
	return map[string]any{
		"skillId":           skillID,
		"name":              sk["name"],
		"version":           sk["version"],
		"hasPackage":        pkgPath != "",
		"packagePath":       pkgPath,
		"packageRoot":       sk["packageRoot"],
		"skillMdPath":       sk["skillMdPath"],
		"hasScripts":        boolFrom(sk["hasScripts"]),
		"scripts":           sk["scripts"],
		"entrypoints":       sk["entrypoints"],
		"readOnly":          boolFrom(sk["readOnly"]),
		"producesArtifacts": boolFrom(sk["producesArtifacts"]),
		"packageFiles":      sk["packageFiles"],
		"packageSha256":     sk["packageSha256"],
		"packageSizeBytes":  sk["packageSizeBytes"],
		"packageFileName":   sk["packageFileName"],
		"skillMarkdown":     md,
	}, nil
}

func skillPackagePayload(sk map[string]any) map[string]any {
	pkgPath := str(sk["packagePath"])
	if pkgPath == "" {
		return nil
	}
	mdPath := filepath.Join(pkgPath, coalesce(str(sk["skillMdPath"]), "SKILL.md"))
	md, _ := os.ReadFile(mdPath)
	scripts, _ := sk["scripts"].([]string)
	if scripts == nil {
		if raw, ok := sk["scripts"].([]any); ok {
			scripts = make([]string, 0, len(raw))
			for _, x := range raw {
				if s := str(x); s != "" {
					scripts = append(scripts, s)
				}
			}
		}
	}
	return map[string]any{
		"packagePath":       pkgPath,
		"skillMarkdown":     string(md),
		"scripts":           scripts,
		"hasScripts":        boolFrom(sk["hasScripts"]),
		"name":              str(sk["name"]),
		"version":           str(sk["version"]),
		"entrypoints":       decodeStringSlice(sk["entrypoints"]),
		"readOnly":          boolFrom(sk["readOnly"]),
		"producesArtifacts": boolFrom(sk["producesArtifacts"]),
	}
}

// ensure JSON round-trip of string slices remains usable after persist
func decodeStringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			if s := str(x); s != "" {
				out = append(out, s)
			}
		}
		return out
	case json.RawMessage:
		var arr []string
		_ = json.Unmarshal(t, &arr)
		return arr
	default:
		return nil
	}
}
