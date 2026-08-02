package modelprov

import "strings"

// MaskCredential returns a UI-safe masked secret (never the plaintext).
func MaskCredential(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "••••••••"
	}
	if len(raw) <= 4 {
		return "••••••••"
	}
	return "••••" + raw[len(raw)-4:]
}

// ExtractCredential prefers body.credential, falls back to apiKey (legacy alias).
func ExtractCredential(body map[string]any) string {
	if body == nil {
		return ""
	}
	if v, ok := body["credential"].(string); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	if v, ok := body["apiKey"].(string); ok && strings.TrimSpace(v) != "" {
		return strings.TrimSpace(v)
	}
	return ""
}

// DataResidencyFromRegion maps region string to cn | global.
func DataResidencyFromRegion(region string) string {
	r := strings.TrimSpace(strings.ToLower(region))
	if r == "cn" || strings.HasPrefix(r, "cn-") {
		return "cn"
	}
	return "global"
}
