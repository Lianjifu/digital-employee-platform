package server

import (
	"context"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/modelprov"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

var (
	modelRLMu sync.Mutex
	modelRL   = map[string][]time.Time{}
)

func (s *Server) modelProbe() *modelprov.Client {
	if s.ModelProbe == nil {
		s.ModelProbe = modelprov.NewClient()
	}
	return s.ModelProbe
}

func requireModelRead(id *auth.Identity) error {
	if id == nil || !auth.Has(id, "model.read") {
		return apperr.Forbidden(apperr.ModelReadForbidden, "缺少 model.read")
	}
	return nil
}

func requireModelWrite(id *auth.Identity) error {
	if id == nil || !auth.Has(id, "model.write") {
		return apperr.Forbidden(apperr.ModelWriteForbidden, "缺少 model.write")
	}
	return nil
}

func vaultRequiredForCredentials() bool {
	for _, k := range []string{"DE_REQUIRE_VAULT", "DE_BAN_MOCK_TOKEN"} {
		v := strings.TrimSpace(os.Getenv(k))
		if v == "1" || strings.EqualFold(v, "true") {
			return true
		}
	}
	return false
}

func budgetEnforceEnabled() bool {
	v := strings.TrimSpace(os.Getenv("DE_MODEL_BUDGET_ENFORCE"))
	if v == "" {
		return false
	}
	return v == "1" || strings.EqualFold(v, "true")
}

func (s *Server) allowModelRate(key string, limit int, window time.Duration) bool {
	if s.Cache != nil && s.Cache.Available() {
		ok, err := s.Cache.AllowRate(context.Background(), "model:"+key, int64(limit), window)
		if err == nil {
			return ok
		}
	}
	now := time.Now()
	modelRLMu.Lock()
	defer modelRLMu.Unlock()
	cut := now.Add(-window)
	arr := modelRL[key]
	alive := arr[:0]
	for _, t := range arr {
		if t.After(cut) {
			alive = append(alive, t)
		}
	}
	if len(alive) >= limit {
		modelRL[key] = alive
		return false
	}
	modelRL[key] = append(alive, now)
	return true
}

func providerModels(p map[string]any) []map[string]any {
	if p == nil {
		return nil
	}
	switch m := p["models"].(type) {
	case []map[string]any:
		return m
	case []any:
		out := make([]map[string]any, 0, len(m))
		for _, x := range m {
			if mm, ok := x.(map[string]any); ok {
				out = append(out, mm)
			}
		}
		return out
	default:
		return nil
	}
}

func setProviderModels(p map[string]any, models []map[string]any) {
	p["models"] = models
}

func stringSlice(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			if s, ok := x.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func normalizeTier(t string) string {
	switch strings.TrimSpace(t) {
	case "official", "self_hosted", "connectable":
		return t
	case "enterprise":
		return "official"
	case "standard":
		return "self_hosted"
	default:
		if t == "" {
			return "connectable"
		}
		return "connectable"
	}
}
