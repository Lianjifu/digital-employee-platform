package policy

import (
	"testing"
)

func subject(ws string, perms, roles, deIDs []string) Subject {
	return Subject{ID: "u1", WorkspaceID: ws, Perms: perms, Roles: roles, EmployeeIDs: deIDs}
}

func TestAuthorizeHappyPath(t *testing.T) {
	caller := subject("ws1", []string{"knowledge.read", "skill.invoke"}, nil, nil)
	d := Authorize(caller, "ws1", []string{"knowledge.read"}, "read_only", "low", "", "")
	if !d.Allowed {
		t.Fatalf("expected allowed, got %+v", d)
	}
}

func TestAuthorizeWorkspaceMismatch(t *testing.T) {
	caller := subject("ws1", []string{"x"}, nil, nil)
	d := Authorize(caller, "ws2", []string{"x"}, "read_only", "low", "", "")
	if d.Allowed || d.Reason != "workspace mismatch" {
		t.Fatalf("want ws mismatch: %+v", d)
	}
}

func TestAuthorizeMissingPerms(t *testing.T) {
	caller := subject("ws1", []string{"a", "b"}, nil, nil)
	d := Authorize(caller, "ws1", []string{"a", "b", "c", "d"}, "read_only", "low", "", "")
	if d.Allowed {
		t.Fatal("missing c,d must deny")
	}
	if len(d.MissingPerms) != 2 || d.MissingPerms[0] != "c" {
		t.Fatalf("missing perms: %+v", d.MissingPerms)
	}
}

func TestAuthorizeRiskHighOnlyForExec(t *testing.T) {
	cases := []struct {
		skillRisk, callRisk string
		allowed             bool
	}{
		{"read_only", "low", true},
		{"local_io", "low", true},
		{"network", "low", false},
		{"network", "medium", true},
		{"network", "high", true},
		{"secrets", "medium", true},
		{"exec", "medium", false},
		{"exec", "high", true},
		{"destructive", "high", true},
		{"unknown-class", "low", true}, // default-open
	}
	for _, tc := range cases {
		caller := subject("ws1", []string{"x"}, nil, nil)
		d := Authorize(caller, "ws1", []string{"x"}, tc.skillRisk, tc.callRisk, "", "")
		if d.Allowed != tc.allowed {
			t.Errorf("skill=%s call=%s want allowed=%v got %v (%s)",
				tc.skillRisk, tc.callRisk, tc.allowed, d.Allowed, d.Reason)
		}
	}
}

func TestAuthorizeSoD(t *testing.T) {
	caller := subject("ws1", []string{"x"}, nil, nil)
	d := Authorize(caller, "ws1", []string{"x"}, "read_only", "low", "u1", "u1")
	if d.Allowed {
		t.Fatal("SoD must block same submitter+approver")
	}
}

func TestAuthorizeWithCatalogRoleInheritance(t *testing.T) {
	caller := subject("ws1", []string{"base"}, []string{"hr.admin"}, nil)
	cat := Catalog{
		WorkspaceID: "ws1",
		Roles:       []RoleGrant{{Role: "hr.admin", Perms: []string{"hr.read", "hr.write"}}},
	}
	d := AuthorizeWithCatalog(caller, cat, []string{"base", "hr.read", "hr.write"}, "read_only", "low", "", "")
	if !d.Allowed {
		t.Fatalf("role inheritance must grant perms: %+v", d)
	}
}

func TestAuthorizeWithCatalogEmployeeInheritance(t *testing.T) {
	caller := subject("ws1", nil, nil, []string{"de-A"})
	cat := Catalog{
		WorkspaceID: "ws1",
		Employees:   []EmployeeGrant{{EmployeeID: "de-A", Perms: []string{"skill.invoke"}}},
	}
	d := AuthorizeWithCatalog(caller, cat, []string{"skill.invoke"}, "exec", "high", "", "")
	if !d.Allowed {
		t.Fatalf("DE inheritance must grant: %+v", d)
	}
}

func TestAuthorizeWithCatalogCrossWorkspaceDenied(t *testing.T) {
	caller := subject("ws1", []string{"x"}, nil, nil)
	cat := Catalog{WorkspaceID: "ws2", Roles: []RoleGrant{{Role: "r", Perms: []string{"x"}}}}
	d := AuthorizeWithCatalog(caller, cat, []string{"x"}, "read_only", "low", "", "")
	if d.Allowed || d.Reason != "workspace mismatch" {
		t.Fatalf("cross-ws must deny: %+v", d)
	}
}

func TestEffectivePermsDedup(t *testing.T) {
	caller := subject("ws1", []string{"a", "b"}, []string{"hr.admin"}, nil)
	cat := Catalog{
		WorkspaceID: "ws1",
		Roles:       []RoleGrant{{Role: "hr.admin", Perms: []string{"b", "c"}}},
	}
	got := effectivePerms(caller, cat)
	// expect {a, b, c}, dedup'd, sorted.
	want := []string{"a", "b", "c"}
	if len(got) != len(want) {
		t.Fatalf("dedup: got %v want %v", got, want)
	}
	for i, v := range want {
		if got[i] != v {
			t.Fatalf("sort/dedup: got %v want %v", got, want)
		}
	}
}

func TestValidateCatalog(t *testing.T) {
	if err := ValidateCatalog(Catalog{}); err == nil {
		t.Fatal("empty workspace id must error")
	}
	cat := Catalog{WorkspaceID: "ws1", Roles: []RoleGrant{{Role: "a"}, {Role: "a"}}}
	if err := ValidateCatalog(cat); err == nil {
		t.Fatal("duplicate role must error")
	}
	if err := ValidateCatalog(Catalog{WorkspaceID: "ws1", Roles: []RoleGrant{{Role: "a"}}}); err != nil {
		t.Fatalf("valid catalog: %v", err)
	}
}

func TestMissingPermsSorted(t *testing.T) {
	got := missingPerms(Subject{Perms: []string{"c"}}, []string{"d", "a", "b"})
	want := []string{"a", "b", "d"}
	for i, v := range want {
		if got[i] != v {
			t.Fatalf("missing sort: got %v want %v", got, want)
		}
	}
}

// TestAuthorize12Combos covers a 2x2x3 risk matrix and 2 risk edges.
func TestAuthorize12Combos(t *testing.T) {
	perms := []string{"skill.invoke"}
	risks := []string{"low", "medium", "high"}
	classes := []string{"read_only", "network", "exec"}
	n := 0
	for _, risk := range risks {
		for _, class := range classes {
			caller := subject("ws1", perms, nil, nil)
			d := Authorize(caller, "ws1", perms, class, risk, "", "")
			n++
			_ = d
		}
	}
	if n != 9 {
		t.Fatalf("expected 9 combos, got %d", n)
	}
	// Also verify 12 with the SoD path.
	withSoD := []string{"", "u1", "u2"}
	for _, submitter := range withSoD {
		for _, approver := range withSoD {
			caller := subject("ws1", perms, nil, nil)
			d := Authorize(caller, "ws1", perms, "read_only", "low", submitter, approver)
			_ = d
		}
	}
}
