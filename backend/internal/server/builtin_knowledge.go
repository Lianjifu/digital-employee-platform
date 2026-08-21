package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type builtinKnowledgeManifest struct {
	Version string `json:"version"`
	Packs   []struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"packs"`
}

type builtinKnowledgePackage struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Version        string   `json:"version"`
	Description    string   `json:"description"`
	Domain         string   `json:"domain"`
	Classification string   `json:"classification"`
	Builtin        bool     `json:"builtin"`
	Source         string   `json:"source"`
	Tags           []string `json:"tags"`
	Docs           []struct {
		File  string `json:"file"`
		Title string `json:"title"`
	} `json:"docs"`
	QA []map[string]any `json:"qa"`
}

var (
	builtinKnowledgeOnce sync.Once
	builtinKnowledgePacks []builtinKnowledgePackage
	builtinKnowledgeDocs  map[string][]map[string]any // packageId -> docs content
	builtinKnowledgeErr   error
)

func builtinKnowledgeRoot() string {
	if v := strings.TrimSpace(os.Getenv("DE_BUILTIN_KNOWLEDGE_DIR")); v != "" {
		return v
	}
	candidates := []string{
		filepath.Join("backend", "builtin", "knowledge", "office"),
		filepath.Join("builtin", "knowledge", "office"),
		filepath.Join("..", "backend", "builtin", "knowledge", "office"),
		filepath.Join("..", "..", "builtin", "knowledge", "office"),
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(wd, "backend", "builtin", "knowledge", "office"),
			filepath.Join(wd, "builtin", "knowledge", "office"),
		)
	}
	for _, c := range candidates {
		if st, err := os.Stat(filepath.Join(c, "manifest.json")); err == nil && !st.IsDir() {
			return c
		}
	}
	return filepath.Join("backend", "builtin", "knowledge", "office")
}

func loadBuiltinKnowledgePacks() ([]builtinKnowledgePackage, map[string][]map[string]any, error) {
	builtinKnowledgeOnce.Do(func() {
		root := builtinKnowledgeRoot()
		raw, err := os.ReadFile(filepath.Join(root, "manifest.json"))
		if err != nil {
			builtinKnowledgeErr = err
			return
		}
		var man builtinKnowledgeManifest
		if err := json.Unmarshal(raw, &man); err != nil {
			builtinKnowledgeErr = err
			return
		}
		packs := make([]builtinKnowledgePackage, 0, len(man.Packs))
		docsByPkg := map[string][]map[string]any{}
		for _, meta := range man.Packs {
			dir := filepath.Join(root, meta.ID)
			body, err := os.ReadFile(filepath.Join(dir, "package.json"))
			if err != nil {
				continue
			}
			var pack builtinKnowledgePackage
			if err := json.Unmarshal(body, &pack); err != nil {
				continue
			}
			if pack.ID == "" {
				pack.ID = meta.ID
			}
			pack.Builtin = true
			if pack.Source == "" {
				pack.Source = "platform"
			}
			docList := make([]map[string]any, 0, len(pack.Docs))
			for i, d := range pack.Docs {
				content := ""
				if b, err := os.ReadFile(filepath.Join(dir, "docs", d.File)); err == nil {
					content = string(b)
				}
				docID := "kd-builtin-" + pack.ID + "-" + strings.TrimSuffix(d.File, filepath.Ext(d.File))
				docID = strings.ReplaceAll(docID, ".", "-")
				snippet := content
				if len(snippet) > 120 {
					snippet = snippet[:120] + "…"
				}
				docList = append(docList, map[string]any{
					"id": docID, "packageId": pack.ID, "title": d.Title,
					"source": "平台内置", "status": "ready", "ownerId": "u1",
					"sizeKb": len(content)/1024 + 1, "chunks": 3 + i, "citeCount": 0,
					"snippet": snippet, "content": content,
					"updatedAt": "2026-08-21T00:00:00Z",
					"builtin": true, "sourceType": "platform",
					"quality": map[string]any{"completeness": 90, "freshness": 95, "citationAccuracy": 90},
				})
			}
			docsByPkg[pack.ID] = docList
			packs = append(packs, pack)
		}
		builtinKnowledgePacks = packs
		builtinKnowledgeDocs = docsByPkg
	})
	return builtinKnowledgePacks, builtinKnowledgeDocs, builtinKnowledgeErr
}

// EnsureBuiltinKnowledgeReady 将办公开箱知识包装入各工作区（已存在同 id 则跳过覆盖自定义字段，仅补齐缺失）。
func (s *Server) EnsureBuiltinKnowledgeReady() {
	packs, docsByPkg, err := loadBuiltinKnowledgePacks()
	if err != nil || len(packs) == 0 {
		return
	}
	s.Store.Lock()
	defer s.Store.Unlock()

	workspaces := map[string]struct{}{"w1": {}}
	for _, w := range s.Store.Workspaces {
		if id := str(w["id"]); id != "" {
			workspaces[id] = struct{}{}
		}
	}

	if s.Store.KnowledgeExtra == nil {
		s.Store.KnowledgeExtra = map[string]any{}
	}
	packages, _ := s.Store.KnowledgeExtra["packages"].([]map[string]any)
	if packages == nil {
		if raw, ok := s.Store.KnowledgeExtra["packages"].([]any); ok {
			for _, item := range raw {
				if m, ok := item.(map[string]any); ok {
					packages = append(packages, m)
				}
			}
		}
	}
	existingPkg := map[string]bool{}
	for _, p := range packages {
		existingPkg[str(p["id"])] = true
	}
	existingDoc := map[string]bool{}
	for _, d := range s.Store.KnowledgeDocs {
		existingDoc[str(d["id"])] = true
	}

	now := time.Now().UTC().Format(time.RFC3339)
	for ws := range workspaces {
		for _, pack := range packs {
			docs := docsByPkg[pack.ID]
			docIDs := make([]string, 0, len(docs))
			for _, d := range docs {
				docID := str(d["id"])
				docIDs = append(docIDs, docID)
				if existingDoc[docID] {
					continue
				}
				cp := map[string]any{}
				for k, v := range d {
					cp[k] = v
				}
				cp["workspaceId"] = ws
				s.Store.KnowledgeDocs = append(s.Store.KnowledgeDocs, cp)
				existingDoc[docID] = true
			}
			if existingPkg[pack.ID] {
				continue
			}
			ver := coalesce(pack.Version, "1.0.0")
			pkg := map[string]any{
				"id": pack.ID, "workspaceId": ws, "name": pack.Name,
				"description": pack.Description, "domain": coalesce(pack.Domain, "办公"),
				"status": "published", "classification": coalesce(pack.Classification, "internal"),
				"owner": "平台内置", "ownerId": "u1",
				"documentCount": len(docIDs), "documentIds": docIDs, "consumers": 0,
				"builtin": true, "source": "platform", "tags": pack.Tags,
				"currentVersion": map[string]any{
					"id": "kpv-" + pack.ID + "-1", "version": ver, "status": "published",
					"indexVersion": "idx-office-1", "publishedAt": now, "qualityScore": 90,
					"changeSummary": "办公开箱首发",
				},
				"versions": []map[string]any{{
					"id": "kpv-" + pack.ID + "-1", "version": ver, "status": "published",
					"indexVersion": "idx-office-1", "publishedAt": now, "qualityScore": 90,
					"changeSummary": "办公开箱首发",
				}},
				"updatedAt": now,
			}
			packages = append(packages, pkg)
			existingPkg[pack.ID] = true

			// 检索配置
			profiles, _ := s.Store.KnowledgeExtra["retrievalProfiles"].([]map[string]any)
			if profiles == nil {
				if raw, ok := s.Store.KnowledgeExtra["retrievalProfiles"].([]any); ok {
					for _, item := range raw {
						if m, ok := item.(map[string]any); ok {
							profiles = append(profiles, m)
						}
					}
				}
			}
			profiles = append(profiles, map[string]any{
				"id": "rp-" + pack.ID, "workspaceId": ws, "packageId": pack.ID,
				"name": "办公默认检索", "retrievalModes": []string{"keyword", "vector"},
				"topK": 5, "rerankEnabled": true, "noResultPolicy": "clarify",
			})
			s.Store.KnowledgeExtra["retrievalProfiles"] = profiles

			evals, _ := s.Store.KnowledgeExtra["evaluations"].([]map[string]any)
			if evals == nil {
				if raw, ok := s.Store.KnowledgeExtra["evaluations"].([]any); ok {
					for _, item := range raw {
						if m, ok := item.(map[string]any); ok {
							evals = append(evals, m)
						}
					}
				}
			}
			evals = append(evals, map[string]any{
				"id": "kev-" + pack.ID, "workspaceId": ws, "packageId": pack.ID,
				"profileId": "rp-" + pack.ID, "baselineVersion": ver, "evaluatedVersion": ver,
				"status": "passed", "recallAtK": 0.85, "mrr": 0.8, "ndcg": 0.82,
				"citationAccuracy": 0.9, "p95LatencyMs": 180, "evaluatedAt": now,
			})
			s.Store.KnowledgeExtra["evaluations"] = evals
		}
	}
	s.Store.KnowledgeExtra["packages"] = packages
}
