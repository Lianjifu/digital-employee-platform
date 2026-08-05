package server

import (
	"fmt"
	"net/http"
	"runtime"
	"sync/atomic"
	"time"
)

var processStart = time.Now()
var httpRequestsTotal atomic.Uint64
var httpRequestDurationMS atomic.Uint64
var copilotStreamTotal atomic.Uint64
var copilotStreamErrors atomic.Uint64
var copilotRateLimited atomic.Uint64
var copilotSafetyBlocked atomic.Uint64
var auditWriteFailures atomic.Uint64
var policyDeniesTotal atomic.Uint64
var modelProbeTotal atomic.Uint64
var modelProbeErrors atomic.Uint64
var modelProbeLatencyMS atomic.Uint64
var modelVaultErrors atomic.Uint64
var modelPolicyPublishTotal atomic.Uint64
var modelBudgetDenies atomic.Uint64

// IncModelProbe records a provider connectivity probe.
func IncModelProbe(ok bool, latencyMS int64) {
	modelProbeTotal.Add(1)
	if latencyMS > 0 {
		modelProbeLatencyMS.Add(uint64(latencyMS))
	}
	if !ok {
		modelProbeErrors.Add(1)
	}
}

func IncModelVaultError()       { modelVaultErrors.Add(1) }
func IncModelPolicyPublish()    { modelPolicyPublishTotal.Add(1) }
func IncModelBudgetDeny()       { modelBudgetDenies.Add(1) }

// IncCopilotStream records a completed Copilot SSE turn.
func IncCopilotStream(ok bool) {
	copilotStreamTotal.Add(1)
	if !ok {
		copilotStreamErrors.Add(1)
	}
}

func IncCopilotRateLimited()  { copilotRateLimited.Add(1) }
func IncCopilotSafetyBlocked() { copilotSafetyBlocked.Add(1) }

// IncAuditWriteFailure increments durable audit fanout failures.
func IncAuditWriteFailure() { auditWriteFailures.Add(1) }

// IncPolicyDeny increments policy engine deny decisions on write paths.
func IncPolicyDeny() { policyDeniesTotal.Add(1) }

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.code = code
	s.ResponseWriter.WriteHeader(code)
}

// Flush preserves SSE / streaming when the underlying writer supports it.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (s *Server) withHTTPMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, code: 200}
		next.ServeHTTP(rec, r)
		httpRequestsTotal.Add(1)
		httpRequestDurationMS.Add(uint64(time.Since(start).Milliseconds()))
		_ = rec.code
	})
}

// metricsPrometheus exposes Prometheus text exposition (scraped by compose profile obs).
func (s *Server) metricsPrometheus(w http.ResponseWriter, r *http.Request) {
	s.Store.RLock()
	audits := len(s.Store.Audits)
	usage := len(s.Store.UsageMeters)
	dlq := len(s.Store.ChannelDLQ)
	tasks := len(s.Store.Tasks)
	s.Store.RUnlock()

	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	svc := s.Mode.String()
	if s.Mode == "" {
		svc = ModeAll.String()
	}
	_, _ = fmt.Fprintf(w, "# HELP de_core_up process up (legacy name; see de_service)\n# TYPE de_core_up gauge\nde_core_up{service=%q} 1\n", svc)
	_, _ = fmt.Fprintf(w, "# HELP de_service service identity\n# TYPE de_service gauge\nde_service{service=%q,mode=%q} 1\n", svc, string(s.Mode))
	_, _ = fmt.Fprintf(w, "# HELP de_core_uptime_seconds process uptime\n# TYPE de_core_uptime_seconds gauge\nde_core_uptime_seconds{service=%q} %f\n", svc, time.Since(processStart).Seconds())
	_, _ = fmt.Fprintf(w, "# HELP de_http_requests_total HTTP requests served\n# TYPE de_http_requests_total counter\nde_http_requests_total{service=%q} %d\n", svc, httpRequestsTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_http_request_duration_ms_sum cumulative request duration ms\n# TYPE de_http_request_duration_ms_sum counter\nde_http_request_duration_ms_sum{service=%q} %d\n", svc, httpRequestDurationMS.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_audit_events_buffered in-memory audit buffer size\n# TYPE de_audit_events_buffered gauge\nde_audit_events_buffered{service=%q} %d\n", svc, audits)
	_, _ = fmt.Fprintf(w, "# HELP de_usage_meters_buffered usage meter buffer\n# TYPE de_usage_meters_buffered gauge\nde_usage_meters_buffered{service=%q} %d\n", svc, usage)
	_, _ = fmt.Fprintf(w, "# HELP de_channel_dlq_size dead letter queue size\n# TYPE de_channel_dlq_size gauge\nde_channel_dlq_size{service=%q} %d\n", svc, dlq)
	_, _ = fmt.Fprintf(w, "# HELP de_tasks_total tasks in store\n# TYPE de_tasks_total gauge\nde_tasks_total{service=%q} %d\n", svc, tasks)
	_, _ = fmt.Fprintf(w, "# HELP de_go_goroutines goroutine count\n# TYPE de_go_goroutines gauge\nde_go_goroutines{service=%q} %d\n", svc, runtime.NumGoroutine())
	_, _ = fmt.Fprintf(w, "# HELP de_go_mem_alloc_bytes allocated heap\n# TYPE de_go_mem_alloc_bytes gauge\nde_go_mem_alloc_bytes{service=%q} %d\n", svc, ms.Alloc)
	pg, rd := 0, 0
	if s.PG != nil {
		pg = 1
	}
	if s.Cache != nil && s.Cache.Available() {
		rd = 1
	}
	_, _ = fmt.Fprintf(w, "# HELP de_postgres_configured postgres pool configured\n# TYPE de_postgres_configured gauge\nde_postgres_configured{service=%q} %d\n", svc, pg)
	_, _ = fmt.Fprintf(w, "# HELP de_redis_configured redis client configured\n# TYPE de_redis_configured gauge\nde_redis_configured{service=%q} %d\n", svc, rd)
	if s.Workflows != nil && s.Workflows.TemporalConfigured() {
		_, _ = fmt.Fprintf(w, "# HELP de_temporal_configured temporal host configured\n# TYPE de_temporal_configured gauge\nde_temporal_configured{service=%q} 1\n", svc)
	} else {
		_, _ = fmt.Fprintf(w, "# HELP de_temporal_configured temporal host configured\n# TYPE de_temporal_configured gauge\nde_temporal_configured{service=%q} 0\n", svc)
	}
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_stream_total Copilot SSE turns\n# TYPE de_copilot_stream_total counter\nde_copilot_stream_total{service=%q} %d\n", svc, copilotStreamTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_stream_errors_total Copilot SSE turns that ended in error\n# TYPE de_copilot_stream_errors_total counter\nde_copilot_stream_errors_total{service=%q} %d\n", svc, copilotStreamErrors.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_rate_limited_total Copilot rate limit hits\n# TYPE de_copilot_rate_limited_total counter\nde_copilot_rate_limited_total{service=%q} %d\n", svc, copilotRateLimited.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_safety_blocked_total Copilot content-safety blocks\n# TYPE de_copilot_safety_blocked_total counter\nde_copilot_safety_blocked_total{service=%q} %d\n", svc, copilotSafetyBlocked.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_audit_write_failures_total durable audit fanout failures\n# TYPE de_audit_write_failures_total counter\nde_audit_write_failures_total{service=%q} %d\n", svc, auditWriteFailures.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_policy_denies_total policy deny on write paths\n# TYPE de_policy_denies_total counter\nde_policy_denies_total{service=%q} %d\n", svc, policyDeniesTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_provider_probe_total model provider probes\n# TYPE de_model_provider_probe_total counter\nde_model_provider_probe_total{service=%q} %d\n", svc, modelProbeTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_provider_probe_errors_total failed model provider probes\n# TYPE de_model_provider_probe_errors_total counter\nde_model_provider_probe_errors_total{service=%q} %d\n", svc, modelProbeErrors.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_provider_probe_latency_ms_sum cumulative probe latency ms\n# TYPE de_model_provider_probe_latency_ms_sum counter\nde_model_provider_probe_latency_ms_sum{service=%q} %d\n", svc, modelProbeLatencyMS.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_vault_errors_total vault errors on model credential paths\n# TYPE de_model_vault_errors_total counter\nde_model_vault_errors_total{service=%q} %d\n", svc, modelVaultErrors.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_policy_publish_total routing policy publishes\n# TYPE de_model_policy_publish_total counter\nde_model_policy_publish_total{service=%q} %d\n", svc, modelPolicyPublishTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_model_budget_denies_total model budget hard denies\n# TYPE de_model_budget_denies_total counter\nde_model_budget_denies_total{service=%q} %d\n", svc, modelBudgetDenies.Load())
}
