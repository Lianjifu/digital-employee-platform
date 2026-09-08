package server

import (
	"net/http"

	"github.com/digital-employee-platform/backend/internal/metrics"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// recordSessionSyncSkew handles POST /api/metrics/session-sync-skew.
// The FE BroadcastChannel layer reports observed clock skew between tabs;
// we aggregate into a server-side metric for the /metrics scrape. Body:
// {skewMs: number, device?: string}. No identity check — this is a
// diagnostic-only endpoint and skew values are not sensitive.
func (s *Server) recordSessionSyncSkew(r *http.Request) (any, error) {
	body, _ := decodeMap(r)
	raw, ok := body["skewMs"]
	if !ok {
		return nil, apperr.BadReq(apperr.BadRequest, "skewMs 必填")
	}
	var skew int64
	switch v := raw.(type) {
	case float64:
		skew = int64(v)
	case int:
		skew = int64(v)
	case int64:
		skew = v
	default:
		return nil, apperr.BadReq(apperr.BadRequest, "skewMs 必须为数字")
	}
	if skew < 0 {
		skew = -skew
	}
	if skew > 24*60*60*1000 {
		// > 1 day — clearly a clock-jump / epoch mix-up; ignore.
		return nil, apperr.BadReq(apperr.BadRequest, "skewMs 超出合理范围")
	}
	metrics.Global.SessionSync.Observe(skew)
	return map[string]any{
		"recorded": true,
		"skewMs":   skew,
	}, nil
}
