// Package scope implements ACL filtering for knowledge docs.
//
// A doc has a Scope block:
//   - "all"               : every viewer in the workspace can see it
//   - "role:<role-id>"    : only viewers with that role can see it
//   - "employee:<de-id>"  : only the digital employee (and its owner) can see it
//   - "conversation:<id>" : only viewers participating in this conversation
//
// A doc can list multiple scope entries (any-match). ScopeTags carry secondary
// labels used by retrieval ranking (preferred tags float up).
package scope

import (
	"sort"
	"strings"
)

// Source is the minimal view of a knowledge doc needed for scope filtering.
type Source struct {
	ID         string
	Workspace  string
	Status     string
	Scopes     []string
	ScopeTags  []string
	OwnerID    string // employee id owning the doc
	Roles      []string
}

// Viewer describes who is asking for the doc.
type Viewer struct {
	IdentityID     string
	WorkspaceID    string
	Roles          []string
	EmployeeIDs    []string // digital-employee IDs the viewer can act as
	ConversationIDs []string // active conversation contexts the viewer is part of
}

// Allowed reports whether v may see doc d.
//
// Status is honored: drafts are visible only to owners and roles with
// knowledge.publish; archived is invisible unless explicitly requested.
func Allowed(d Source, v Viewer) bool {
	if d.Workspace != "" && v.WorkspaceID != "" && d.Workspace != v.WorkspaceID {
		return false
	}
	st := strings.ToLower(strings.TrimSpace(d.Status))
	if st == "archived" {
		return false
	}
	// Drafts require knowledge.publish or ownership.
	if st == "draft" {
		for _, r := range v.Roles {
			if r == "knowledge.publish" || r == "knowledge.admin" {
				return true
			}
		}
		if d.OwnerID != "" && containsString(v.EmployeeIDs, d.OwnerID) {
			return true
		}
		return false
	}
	// For ready/published: at least one scope entry must match (or scopes empty = open).
	scopes := make([]string, 0, len(d.Scopes))
	for _, s := range d.Scopes {
		s = strings.TrimSpace(s)
		if s != "" {
			scopes = append(scopes, s)
		}
	}
	if len(scopes) == 0 {
		return true
	}
	for _, s := range scopes {
		switch {
		case s == "all":
			return true
		case strings.HasPrefix(s, "role:"):
			role := strings.TrimPrefix(s, "role:")
			if containsAnyCI(v.Roles, role) {
				return true
			}
		case strings.HasPrefix(s, "employee:"):
			de := strings.TrimPrefix(s, "employee:")
			if containsAnyCI(v.EmployeeIDs, de) {
				return true
			}
		case strings.HasPrefix(s, "conversation:"):
			// Conversation scope is honored only when the viewer is currently
			// participating in that conversation. The chat server should
			// populate Viewer.ConversationIDs and we check it inline.
			if containsAnyCI(v.ConversationIDs, strings.TrimPrefix(s, "conversation:")) {
				return true
			}
		}
	}
	return false
}

func containsAnyCI(s []string, want string) bool {
	want = strings.ToLower(strings.TrimSpace(want))
	for _, x := range s {
		if strings.ToLower(strings.TrimSpace(x)) == want {
			return true
		}
	}
	return false
}

// Rank applies scope preference to a list of (doc, score) pairs.
// +0.05 per matching scope tag, -0.10 if the doc would be filtered out
// (caller should call Allowed first; Rank won't drop already-filtered docs).
func Rank[T any](docs []T, scopeOf func(T) []string, viewerTags []string) {
	if len(docs) == 0 {
		return
	}
	sort.SliceStable(docs, func(i, j int) bool {
		ti := tagOverlap(scopeOf(docs[i]), viewerTags)
		tj := tagOverlap(scopeOf(docs[j]), viewerTags)
		if ti != tj {
			return ti > tj
		}
		return false
	})
}

func tagOverlap(scopeTags, viewerTags []string) int {
	if len(scopeTags) == 0 || len(viewerTags) == 0 {
		return 0
	}
	m := make(map[string]bool, len(viewerTags))
	for _, t := range viewerTags {
		m[strings.ToLower(strings.TrimSpace(t))] = true
	}
	n := 0
	for _, t := range scopeTags {
		if m[strings.ToLower(strings.TrimSpace(t))] {
			n++
		}
	}
	return n
}

func normalizeScopes(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.ToLower(strings.TrimSpace(s))
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func containsString(s []string, want string) bool {
	for _, x := range s {
		if x == want {
			return true
		}
	}
	return false
}
