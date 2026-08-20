// Package runtimeenv is the single source of truth for demo vs production data mode.
package runtimeenv

import (
	"os"
	"strings"
)

// Mode is the process data/governance profile.
type Mode string

const (
	ModeDemo        Mode = "demo"
	ModeDevelopment Mode = "development"
	ModeStaging     Mode = "staging"
	ModeProduction  Mode = "production"
)

// FromEnv resolves DE_ENV (alias: mock→demo, prod→production). GO_ENV is a fallback.
// Tests should use t.Setenv("DE_ENV", ...) — no process-global override (parallel-safe).
func FromEnv() Mode {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("DE_ENV")))
	if raw == "" {
		raw = strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV")))
	}
	return Parse(raw)
}

// Parse normalizes a raw env string. Empty → development (safe default for local binary).
func Parse(raw string) Mode {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "demo", "mock":
		return ModeDemo
	case "staging":
		return ModeStaging
	case "production", "prod":
		return ModeProduction
	case "development", "dev", "local", "":
		return ModeDevelopment
	default:
		return ModeDevelopment
	}
}

func (m Mode) String() string {
	if m == "" {
		return string(ModeDevelopment)
	}
	return string(m)
}

func (m Mode) IsDemo() bool { return m == ModeDemo }

func (m Mode) RequiresPostgres() bool { return m != ModeDemo }

func (m Mode) AllowsSeed() bool { return m == ModeDemo }

func (m Mode) PersistEnabled() bool { return m != ModeDemo }

// AllowsDemoToken permits mock-*-token style identities (demo only).
func (m Mode) AllowsDemoToken() bool {
	if m.IsDemo() {
		return true
	}
	if m == ModeDevelopment && envFlagTrue("DE_ALLOW_DEMO_TOKEN") {
		return true
	}
	return false
}

// RequiresVault is true for staging/production (or DE_REQUIRE_VAULT=1).
func (m Mode) RequiresVault() bool {
	if envFlagTrue("DE_REQUIRE_VAULT") {
		return true
	}
	return m == ModeStaging || m == ModeProduction
}

// DualApproval enables SoD / dual approval gates (staging/production only).
// DE_BAN_MOCK_TOKEN must NOT imply dual approval.
func (m Mode) DualApproval() bool {
	return m == ModeStaging || m == ModeProduction
}

// AllowsDemoIdentityHeaders controls x-mock-* identity forging.
func (m Mode) AllowsDemoIdentityHeaders() bool {
	if envFlagTrue("DE_ALLOW_MOCK_IDENTITY") || envFlagTrue("DE_ALLOW_DEMO_IDENTITY") {
		return true
	}
	if envFlagFalse("DE_ALLOW_MOCK_IDENTITY") || envFlagFalse("DE_ALLOW_DEMO_IDENTITY") {
		return false
	}
	if m.DualApproval() {
		return false
	}
	if banDemoToken() {
		return false
	}
	return m == ModeDemo || m == ModeDevelopment
}

// BanDemoToken reports DE_BAN_DEMO_TOKEN / DE_BAN_MOCK_TOKEN.
func BanDemoToken() bool { return banDemoToken() }

func banDemoToken() bool {
	if envFlagTrue("DE_BAN_DEMO_TOKEN") || envFlagTrue("DE_BAN_MOCK_TOKEN") {
		return true
	}
	if envFlagFalse("DE_BAN_DEMO_TOKEN") || envFlagFalse("DE_BAN_MOCK_TOKEN") {
		return false
	}
	m := FromEnv()
	return m == ModeStaging || m == ModeProduction
}

func envFlagTrue(key string) bool {
	v := strings.TrimSpace(os.Getenv(key))
	return v == "1" || strings.EqualFold(v, "true")
}

func envFlagFalse(key string) bool {
	v := strings.TrimSpace(os.Getenv(key))
	return v == "0" || strings.EqualFold(v, "false")
}

// EnsureGeneralEmployeeAllowed: only demo, or development with DE_ENSURE_GENERAL=1.
func (m Mode) EnsureGeneralEmployeeAllowed() bool {
	if m.IsDemo() {
		return true
	}
	if m == ModeDevelopment && envFlagTrue("DE_ENSURE_GENERAL") {
		return true
	}
	return false
}
