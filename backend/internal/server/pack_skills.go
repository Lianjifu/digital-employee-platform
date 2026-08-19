package server

import (
	"net/http"
	"strings"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

type skillPackDef struct {
	PackName          string   `json:"packName"`
	Phase             string   `json:"phase"`
	AutoInstall       bool     `json:"autoInstall"`
	RequiresApproval  bool     `json:"requiresApproval"`
	Skills            []string `json:"skills"`
}

func (m *builtinManifest) normalizePacks() map[string]skillPackDef {
	out := map[string]skillPackDef{}
	if len(m.Packs) > 0 {
		for id, p := range m.Packs {
			out[id] = p
		}
		return out
	}
	out["general"] = skillPackDef{
		PackName: coalesce(m.PackName, "通用"), Phase: "P0", AutoInstall: true,
		Skills: m.GeneralPackSkills,
	}
	return out
}

func (m *builtinManifest) packSkills(packID string) []string {
	packs := m.normalizePacks()
	if p, ok := packs[packID]; ok {
		return append([]string{}, p.Skills...)
	}
	if packID == "general" {
		return append([]string{}, m.GeneralPackSkills...)
	}
	return nil
}

func skillInAnyPack(m builtinManifest, dirName string) []string {
	var packs []string
	for id, p := range m.normalizePacks() {
		for _, sk := range p.Skills {
			if sk == dirName {
				packs = append(packs, id)
				break
			}
		}
	}
	return packs
}

func (s *Server) listSkillPacks(_ *http.Request) (any, error) {
	m := loadBuiltinManifest()
	packs := m.normalizePacks()
	out := make([]map[string]any, 0, len(packs))
	for id, p := range packs {
		out = append(out, map[string]any{
			"packId": id, "packName": p.PackName, "phase": p.Phase,
			"autoInstall": p.AutoInstall, "requiresApproval": p.RequiresApproval,
			"skillCount": len(p.Skills), "skills": p.Skills,
		})
	}
	return map[string]any{"packs": out}, nil
}

func (s *Server) applySkillPack(r *http.Request) (any, error) {
	id := identityFrom(r.Context())
	if err := requireSkillWrite(id); err != nil {
		return nil, err
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "岗位包 ID 无效")
	}
	packID := parts[3]
	if packID == "general" {
		return s.applyGeneralPack(r)
	}
	ws := s.workspaceID(r)
	body, _ := decodeMap(r)
	manifest := loadBuiltinManifest()
	packs := manifest.normalizePacks()
	pack, ok := packs[packID]
	if !ok {
		return nil, apperr.NotFoundErr(apperr.NotFound, "未知岗位包: "+packID)
	}
	if pack.RequiresApproval && strings.TrimSpace(str(body["approvalTicket"])) == "" {
		return nil, apperr.Forbidden(apperr.ReleaseRequestRequired, "E_APPROVAL_REQUIRED: 重依赖岗位包需要审批")
	}
	s.Store.Lock()
	s.ensureBuiltinCatalogLocked(manifest)
	for _, skillName := range pack.Skills {
		s.ensureOneBuiltinInstalledLocked(ws, skillName, manifest, packID)
	}
	s.Store.Unlock()
	go s.persistSkills()
	return map[string]any{
		"packId": packID, "packName": pack.PackName, "phase": pack.Phase,
		"skills": pack.Skills, "workspaceId": ws, "installed": len(pack.Skills),
	}, nil
}

func (s *Server) ensurePackInstalledLocked(ws, packID string, manifest builtinManifest) {
	for _, skillName := range manifest.packSkills(packID) {
		s.ensureOneBuiltinInstalledLocked(ws, skillName, manifest, packID)
	}
}
