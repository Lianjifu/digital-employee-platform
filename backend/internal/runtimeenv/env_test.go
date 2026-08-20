package runtimeenv

import (
	"testing"
)

func TestParseAliases(t *testing.T) {
	cases := map[string]Mode{
		"": ModeDevelopment, "dev": ModeDevelopment, "local": ModeDevelopment,
		"demo": ModeDemo, "mock": ModeDemo,
		"staging": ModeStaging, "production": ModeProduction, "prod": ModeProduction,
	}
	for in, want := range cases {
		if got := Parse(in); got != want {
			t.Fatalf("Parse(%q)=%q want %q", in, got, want)
		}
	}
}

func TestDemoModeFlags(t *testing.T) {
	m := ModeDemo
	if !m.IsDemo() || m.PersistEnabled() || m.RequiresPostgres() || !m.AllowsSeed() {
		t.Fatalf("demo flags wrong: %+v persist=%v pg=%v seed=%v", m, m.PersistEnabled(), m.RequiresPostgres(), m.AllowsSeed())
	}
	if !m.AllowsDemoToken() || m.DualApproval() || m.RequiresVault() {
		t.Fatal("demo should allow token, no dual approval, no vault")
	}
}

func TestProductionModeFlags(t *testing.T) {
	m := ModeProduction
	if m.IsDemo() || !m.PersistEnabled() || !m.RequiresPostgres() || m.AllowsSeed() {
		t.Fatal("production data flags")
	}
	if m.AllowsDemoToken() || !m.DualApproval() || !m.RequiresVault() {
		t.Fatal("production governance flags")
	}
}

func TestBanMockDoesNotImplyDualApproval(t *testing.T) {
	t.Setenv("DE_ENV", "development")
	t.Setenv("DE_BAN_MOCK_TOKEN", "1")
	m := FromEnv()
	if m.DualApproval() {
		t.Fatal("DE_BAN_MOCK_TOKEN must not enable dual approval in development")
	}
	if m.AllowsDemoToken() {
		t.Fatal("development + BAN should not allow demo token")
	}
}
