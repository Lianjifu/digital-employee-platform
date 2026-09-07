// Package provenance implements the audit-friendly "where did this memory
// come from" record attached to every MemoryRecord.
//
// Mem7 — the previous code stored memories as map[string]any with no
// consistent origin field. Operators couldn't tell whether a fact was
// extracted from a chat, hand-written by an admin, or imported from a
// third-party KB. This package defines:
//
//   - Source (the canonical enum of where the record came from).
//   - Provenance (the full lineage: source + actor + reference + hash).
//   - Stamp (build a Provenance from a source + actor + optional ref).
//   - Migration helpers (FillDefaults walks a slice of legacy records and
//     stamps them so existing data still passes new validation).
package provenance

import (
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"sort"
	"strings"
	"time"
)

// Source is the origin classification.
type Source string

const (
	SourceChat      Source = "chat"        // extracted from a user conversation
	SourceAdmin     Source = "admin"       // hand-written by a human admin
	SourceImport    Source = "import"      // imported from a third-party KB
	SourceSchedule  Source = "schedule"    // produced by a scheduled job
	SourceSystem    Source = "system"      // synthesized by the platform
	SourceMigration Source = "migration"   // legacy records during upgrade
)

// Provenance is the lineage attached to a memory record.
type Provenance struct {
	Source     Source `json:"source"`
	ActorID    string `json:"actorId,omitempty"`     // user/employee who created it
	ActorName  string `json:"actorName,omitempty"`
	Reference  string `json:"reference,omitempty"`   // url, conversation id, kb id, etc.
	ContentSHA string `json:"contentSha,omitempty"`  // sha1 of content at creation
	CreatedAt  string `json:"createdAt,omitempty"`   // RFC3339
	Note       string `json:"note,omitempty"`
}

// errInvalidSource signals that an unrecognized source string was passed.
var errInvalidSource = errors.New("provenance: invalid source")

// Stamp returns a Provenance populated with SHA + timestamps.
func Stamp(source Source, actorID, actorName, reference, content, note string) (Provenance, error) {
	if !validSource(source) {
		return Provenance{}, errInvalidSource
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return Provenance{
		Source:     source,
		ActorID:    strings.TrimSpace(actorID),
		ActorName:  strings.TrimSpace(actorName),
		Reference:  strings.TrimSpace(reference),
		ContentSHA: hashContent(content),
		CreatedAt:  now,
		Note:       note,
	}, nil
}

// StampLegacy is for records that pre-date provenance tracking.
// Source is set to SourceMigration and Actor is "system".
func StampLegacy(content string) Provenance {
	return Provenance{
		Source:     SourceMigration,
		ActorID:    "system",
		ActorName:  "system",
		ContentSHA: hashContent(content),
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		Note:       "auto-stamped during provenance migration",
	}
}

// Validate returns nil iff the Provenance is well-formed.
func Validate(p Provenance) error {
	if !validSource(p.Source) {
		return errInvalidSource
	}
	if strings.TrimSpace(p.CreatedAt) == "" {
		return errors.New("provenance: createdAt required")
	}
	if _, err := time.Parse(time.RFC3339, p.CreatedAt); err != nil {
		return errors.New("provenance: createdAt must be RFC3339")
	}
	return nil
}

func validSource(s Source) bool {
	switch s {
	case SourceChat, SourceAdmin, SourceImport, SourceSchedule, SourceSystem, SourceMigration:
		return true
	}
	return false
}

// FillDefaults walks a slice of legacy map[string]any memory records and
// stamps a Provenance on each one that lacks it. Returns the count of
// records stamped.
//
// Records are mutated in place; the caller is responsible for persistence.
func FillDefaults(records []map[string]any) int {
	n := 0
	for _, r := range records {
		if _, ok := r["provenance"]; ok {
			continue
		}
		title := ""
		if v, ok := r["title"]; ok {
			title, _ = v.(string)
		}
		content := ""
		if v, ok := r["content"]; ok {
			content, _ = v.(string)
		}
		createdAt := ""
		if v, ok := r["createdAt"]; ok {
			createdAt, _ = v.(string)
		}
		p := StampLegacy(title + "\n" + content)
		if createdAt != "" {
			p.CreatedAt = createdAt
		}
		r["provenance"] = p
		n++
	}
	return n
}

// Equal returns true iff p and other have the same SHA + source + reference.
func Equal(p, other Provenance) bool {
	return p.Source == other.Source &&
		p.Reference == other.Reference &&
		p.ContentSHA == other.ContentSHA
}

// TopSources returns the N most common Sources across provenance records.
// Useful for audit dashboards.
func TopSources(records []Provenance, n int) []SourceCount {
	if n <= 0 {
		n = 5
	}
	counts := map[Source]int{}
	for _, r := range records {
		counts[r.Source]++
	}
	out := make([]SourceCount, 0, len(counts))
	for s, c := range counts {
		out = append(out, SourceCount{Source: s, Count: c})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Count > out[j].Count })
	if len(out) > n {
		out = out[:n]
	}
	return out
}

// SourceCount is the (source, count) row used by audit dashboards.
type SourceCount struct {
	Source Source `json:"source"`
	Count  int    `json:"count"`
}

func hashContent(s string) string {
	if s == "" {
		return ""
	}
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}
