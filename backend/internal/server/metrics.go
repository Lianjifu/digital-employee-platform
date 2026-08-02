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
var auditWriteFailures atomic.Uint64
var policyDeniesTotal atomic.Uint64

// IncCopilotStream records a completed Copilot SSE turn.
func IncCopilotStream(ok bool) {
	copilotStreamTotal.Add(1)
	if !ok {
		copilotStreamErrors.Add(1)
	}
}

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
	_, _ = fmt.Fprintf(w, "# HELP de_core_up de-core process up\n# TYPE de_core_up gauge\nde_core_up 1\n")
	_, _ = fmt.Fprintf(w, "# HELP de_core_uptime_seconds process uptime\n# TYPE de_core_uptime_seconds gauge\nde_core_uptime_seconds %f\n", time.Since(processStart).Seconds())
	_, _ = fmt.Fprintf(w, "# HELP de_http_requests_total HTTP requests served\n# TYPE de_http_requests_total counter\nde_http_requests_total %d\n", httpRequestsTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_http_request_duration_ms_sum cumulative request duration ms\n# TYPE de_http_request_duration_ms_sum counter\nde_http_request_duration_ms_sum %d\n", httpRequestDurationMS.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_audit_events_buffered in-memory audit buffer size\n# TYPE de_audit_events_buffered gauge\nde_audit_events_buffered %d\n", audits)
	_, _ = fmt.Fprintf(w, "# HELP de_usage_meters_buffered usage meter buffer\n# TYPE de_usage_meters_buffered gauge\nde_usage_meters_buffered %d\n", usage)
	_, _ = fmt.Fprintf(w, "# HELP de_channel_dlq_size dead letter queue size\n# TYPE de_channel_dlq_size gauge\nde_channel_dlq_size %d\n", dlq)
	_, _ = fmt.Fprintf(w, "# HELP de_tasks_total tasks in store\n# TYPE de_tasks_total gauge\nde_tasks_total %d\n", tasks)
	_, _ = fmt.Fprintf(w, "# HELP de_go_goroutines goroutine count\n# TYPE de_go_goroutines gauge\nde_go_goroutines %d\n", runtime.NumGoroutine())
	_, _ = fmt.Fprintf(w, "# HELP de_go_mem_alloc_bytes allocated heap\n# TYPE de_go_mem_alloc_bytes gauge\nde_go_mem_alloc_bytes %d\n", ms.Alloc)
	pg, rd := 0, 0
	if s.PG != nil {
		pg = 1
	}
	if s.Cache != nil && s.Cache.Available() {
		rd = 1
	}
	_, _ = fmt.Fprintf(w, "# HELP de_postgres_configured postgres pool configured\n# TYPE de_postgres_configured gauge\nde_postgres_configured %d\n", pg)
	_, _ = fmt.Fprintf(w, "# HELP de_redis_configured redis client configured\n# TYPE de_redis_configured gauge\nde_redis_configured %d\n", rd)
	if s.Workflows != nil && s.Workflows.TemporalConfigured() {
		_, _ = fmt.Fprintf(w, "# HELP de_temporal_configured temporal host configured\n# TYPE de_temporal_configured gauge\nde_temporal_configured 1\n")
	} else {
		_, _ = fmt.Fprintf(w, "# HELP de_temporal_configured temporal host configured\n# TYPE de_temporal_configured gauge\nde_temporal_configured 0\n")
	}
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_stream_total Copilot SSE turns\n# TYPE de_copilot_stream_total counter\nde_copilot_stream_total %d\n", copilotStreamTotal.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_copilot_stream_errors_total Copilot SSE turns that ended in error\n# TYPE de_copilot_stream_errors_total counter\nde_copilot_stream_errors_total %d\n", copilotStreamErrors.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_audit_write_failures_total durable audit fanout failures\n# TYPE de_audit_write_failures_total counter\nde_audit_write_failures_total %d\n", auditWriteFailures.Load())
	_, _ = fmt.Fprintf(w, "# HELP de_policy_denies_total policy deny on write paths\n# TYPE de_policy_denies_total counter\nde_policy_denies_total %d\n", policyDeniesTotal.Load())
}
