package auth

import (
	"testing"
)

func TestRolePermissionsAdminIncludesAdminOnlyPerms(t *testing.T) {
	perms := RolePermissions("admin")
	want := []string{
		"canvas.comment",
		"skill.vet.override",
		"publisher_key.rotate",
		"vault.read",
	}
	for _, p := range want {
		found := false
		for _, have := range perms {
			if have == p {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("admin should have %q, got %v", p, perms)
		}
	}
}

func TestRolePermissionsAuditorExcludesAdminOnlyPerms(t *testing.T) {
	perms := RolePermissions("auditor")
	forbid := []string{
		"canvas.comment",
		"skill.vet.override",
		"publisher_key.rotate",
		"vault.read",
	}
	for _, p := range forbid {
		for _, have := range perms {
			if have == p {
				t.Errorf("auditor should not have %q, got %v", p, perms)
			}
		}
	}
}

func TestRolePermissionsUserExcludesAdminOnlyPerms(t *testing.T) {
	perms := RolePermissions("user")
	forbid := []string{
		"canvas.comment",
		"skill.vet.override",
		"publisher_key.rotate",
		"vault.read",
	}
	for _, p := range forbid {
		for _, have := range perms {
			if have == p {
				t.Errorf("user should not have %q, got %v", p, perms)
			}
		}
	}
}

func TestRolePermissionsUnknownRoleFallsBackToUser(t *testing.T) {
	perms := RolePermissions("unknown")
	user := RolePermissions("user")
	if len(perms) != len(user) {
		t.Errorf("unknown role should fall back to user, got len=%d user len=%d", len(perms), len(user))
	}
}
