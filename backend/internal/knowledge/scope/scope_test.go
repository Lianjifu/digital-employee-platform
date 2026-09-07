package scope

import (
	"reflect"
	"testing"
)

func viewer(roles []string, deIDs, convIDs []string) Viewer {
	return Viewer{
		IdentityID:      "user-1",
		WorkspaceID:     "ws-1",
		Roles:           roles,
		EmployeeIDs:     deIDs,
		ConversationIDs: convIDs,
	}
}

func doc(scopes []string, status string) Source {
	return Source{
		ID:        "d1",
		Workspace: "ws-1",
		Status:    status,
		Scopes:    scopes,
		OwnerID:   "de-A",
	}
}

func TestAllowedOpenScope(t *testing.T) {
	d := doc([]string{"all"}, "ready")
	if !Allowed(d, viewer([]string{}, nil, nil)) {
		t.Fatal("open scope must be visible to any viewer in workspace")
	}
}

func TestAllowedRoleScoped(t *testing.T) {
	d := doc([]string{"role:hr.admin"}, "ready")
	if Allowed(d, viewer([]string{"viewer"}, nil, nil)) {
		t.Fatal("hr doc must be invisible to non-hr viewer")
	}
	if !Allowed(d, viewer([]string{"hr.admin"}, nil, nil)) {
		t.Fatal("hr doc must be visible to hr.admin viewer")
	}
}

func TestAllowedEmployeeScoped(t *testing.T) {
	d := doc([]string{"employee:de-A"}, "ready")
	if Allowed(d, viewer([]string{}, []string{"de-B"}, nil)) {
		t.Fatal("employee-scoped doc must be invisible to non-owner")
	}
	if !Allowed(d, viewer([]string{}, []string{"de-A"}, nil)) {
		t.Fatal("employee-scoped doc must be visible to owning employee")
	}
}

func TestAllowedConversationScoped(t *testing.T) {
	d := doc([]string{"conversation:c-1"}, "ready")
	if Allowed(d, viewer([]string{}, nil, []string{"c-2"})) {
		t.Fatal("conversation-scoped doc must be invisible to other conv")
	}
	if !Allowed(d, viewer([]string{}, nil, []string{"c-1"})) {
		t.Fatal("conversation-scoped doc must be visible to participant")
	}
}

func TestAllowedAnyScopeMatch(t *testing.T) {
	d := doc([]string{"role:hr.admin", "employee:de-A"}, "ready")
	if !Allowed(d, viewer([]string{"hr.admin"}, nil, nil)) {
		t.Fatal("role match should suffice")
	}
	if !Allowed(d, viewer([]string{}, []string{"de-A"}, nil)) {
		t.Fatal("employee match should suffice")
	}
}

func TestAllowedDraftRequiresPublishOrOwner(t *testing.T) {
	d := doc([]string{"all"}, "draft")
	if Allowed(d, viewer([]string{"viewer"}, nil, nil)) {
		t.Fatal("draft must be invisible to regular viewer")
	}
	if !Allowed(d, viewer([]string{"knowledge.publish"}, nil, nil)) {
		t.Fatal("draft must be visible to publish role")
	}
	if !Allowed(d, viewer([]string{}, []string{"de-A"}, nil)) {
		t.Fatal("draft must be visible to owning employee")
	}
}

func TestAllowedArchivedInvisible(t *testing.T) {
	d := doc([]string{"all"}, "archived")
	if Allowed(d, viewer([]string{"knowledge.admin"}, nil, nil)) {
		t.Fatal("archived must be invisible even to admins (audit only)")
	}
}

func TestAllowedCrossWorkspaceDenied(t *testing.T) {
	d := Source{ID: "d1", Workspace: "ws-2", Status: "ready", Scopes: []string{"all"}}
	if Allowed(d, viewer([]string{}, nil, nil)) {
		t.Fatal("cross-workspace doc must be denied")
	}
}

func TestAllowedEmptyScopesOpen(t *testing.T) {
	d := doc(nil, "ready")
	if !Allowed(d, viewer([]string{}, nil, nil)) {
		t.Fatal("empty scopes must default to open within workspace")
	}
}

func TestRankScopeTagOverlap(t *testing.T) {
	type item struct {
		score float64
		tags  []string
	}
	items := []item{
		{score: 0.5, tags: []string{"hr"}},
		{score: 0.9, tags: []string{"hr", "policy"}},
		{score: 0.7, tags: []string{"ops"}},
	}
	Rank(items, func(i item) []string { return i.tags }, []string{"hr", "policy"})
	// We only re-rank by tag overlap; we expect the item with both tags first.
	if items[0].score != 0.9 {
		t.Fatalf("expected 0.9 first, got %v", items[0])
	}
}

func TestRankStableEmpty(t *testing.T) {
	items := []string{}
	Rank(items, func(s string) []string { return nil }, []string{"x"})
	if len(items) != 0 {
		t.Fatalf("empty input unchanged")
	}
	_ = reflect.DeepEqual
}
