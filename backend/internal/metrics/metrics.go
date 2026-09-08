// Package metrics holds the W1-W7 cross-cutting Prometheus counters and
// gauges. Implementation is lock-free via sync/atomic; the
// metricsPrometheus handler in internal/server/metrics.go reads them when
// scrapes hit /metrics.
//
// Each metric is labelled by a small enum (verdict / result / ref) so
// dashboards can break down on the source — never on a high-cardinality
// value like a full KeyID (use audit log for that).
package metrics

import (
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Counter is an atomic uint64 with helper Increment.
type Counter uint64

func (c *Counter) Inc() { atomic.AddUint64((*uint64)(c), 1) }
func (c *Counter) Add(n uint64) {
	atomic.AddUint64((*uint64)(c), n)
}
func (c *Counter) Value() uint64 { return atomic.LoadUint64((*uint64)(c)) }
func (c *Counter) Store(v uint64) { atomic.StoreUint64((*uint64)(c), v) }
func (c *Counter) CAS(old, new uint64) bool {
	return atomic.CompareAndSwapUint64((*uint64)(c), old, new)
}

// SkillVetterTotal counts vetter.Run outcomes across all builtin attach /
// skill import paths. verdict ∈ {"allow", "warn", "deny"}.
type VetterBuckets struct {
	Allow Counter
	Warn  Counter
	Deny  Counter
}

func (v *VetterBuckets) Inc(verdict string) {
	switch verdict {
	case "allow":
		v.Allow.Inc()
	case "warn":
		v.Warn.Inc()
	case "deny":
		v.Deny.Inc()
	}
}

func (v *VetterBuckets) Snapshot() (allow, warn, deny uint64) {
	return v.Allow.Value(), v.Warn.Value(), v.Deny.Value()
}

// SkillSignTotal counts Ed25519 sign + verify outcomes.
// result ∈ {"success", "invalid", "unknown_key", "denied"}.
//
// "sign" and "verify" are tracked separately so dashboards can distinguish
// publisher-side failures from consumer-side failures.
type SignBuckets struct {
	SignSuccess  Counter
	SignInvalid  Counter
	VerifyOK     Counter
	VerifyMiss   Counter // unknown_key / key not in trust store
	VerifyBadSig Counter // signature mismatch (tamper / wrong key)
}

func (s *SignBuckets) IncSign(result string) {
	switch result {
	case "success":
		s.SignSuccess.Inc()
	case "invalid":
		s.SignInvalid.Inc()
	}
}

func (s *SignBuckets) IncVerify(result string) {
	switch result {
	case "ok":
		s.VerifyOK.Inc()
	case "unknown_key":
		s.VerifyMiss.Inc()
	case "bad_signature":
		s.VerifyBadSig.Inc()
	}
}

func (s *SignBuckets) Snapshot() (signOK, signInvalid, verifyOK, verifyMiss, verifyBad uint64) {
	return s.SignSuccess.Value(), s.SignInvalid.Value(),
		s.VerifyOK.Value(), s.VerifyMiss.Value(), s.VerifyBadSig.Value()
}

// VaultResolveSeconds sums Resolve latency bucketed by ref class. ref
// ∈ {"skill-key", "model-credential", "other"}. Sum is sufficient for the
// W1-W7 plan — a per-ref histogram can come in W6 when a real
// Grafana dashboard is wired up.
type VaultBuckets struct {
	SkillKeyCount      Counter
	SkillKeySumNS      Counter
	ModelCredCount     Counter
	ModelCredSumNS     Counter
	OtherCount         Counter
	OtherSumNS         Counter
}

// Observe records one Resolve call. duration is the wall-clock time
// elapsed since the call started.
func (v *VaultBuckets) Observe(ref string, d time.Duration) {
	ns := uint64(d.Nanoseconds())
	switch ref {
	case "skill-key":
		v.SkillKeyCount.Inc()
		v.SkillKeySumNS.Add(ns)
	case "model-credential":
		v.ModelCredCount.Inc()
		v.ModelCredSumNS.Add(ns)
	default:
		v.OtherCount.Inc()
		v.OtherSumNS.Add(ns)
	}
}

func (v *VaultBuckets) Snapshot() (skillN, skillSumNS, modelN, modelSumNS, otherN, otherSumNS uint64) {
	return v.SkillKeyCount.Value(), v.SkillKeySumNS.Value(),
		v.ModelCredCount.Value(), v.ModelCredSumNS.Value(),
		v.OtherCount.Value(), v.OtherSumNS.Value()
}

// ExpertInboxPending is a snapshot gauge, populated each scrape from the
// store. Stored as atomic so the scrape handler can publish without
// holding the store RLock for the duration of the HTTP write.
type ExpertInboxGauge struct {
	Value atomic.Uint64
}

func (g *ExpertInboxGauge) Set(n uint64) { g.Value.Store(n) }
func (g *ExpertInboxGauge) Get() uint64  { return g.Value.Load() }

// HotReloadReloadTotal counts successful + failed reload attempts
// across all watched config resources. label: resource name (e.g.
// "publisher-key", "routing-policy"); result ∈ {"success", "fail"}.
type HotReloadBuckets struct {
	Success map[string]*Counter
	Fail    map[string]*Counter
	mu      sync.Mutex
}

// VisualDiffBuckets records per-size cumulative latency for visualdiff.
// size ∈ {"small", "medium", "large", "huge"} — coarse buckets so the
// dashboard can chart "tiny snapshot diffs" vs "1080p canvas diffs"
// without per-resolution cardinality.
type VisualDiffBuckets struct {
	SmallCount  Counter
	SmallSumNS  Counter
	MediumCount Counter
	MediumSumNS Counter
	LargeCount  Counter
	LargeSumNS  Counter
	HugeCount   Counter
	HugeSumNS   Counter
}

func (v *VisualDiffBuckets) Observe(size string, d time.Duration) {
	ns := uint64(d.Nanoseconds())
	switch size {
	case "small":
		v.SmallCount.Inc()
		v.SmallSumNS.Add(ns)
	case "medium":
		v.MediumCount.Inc()
		v.MediumSumNS.Add(ns)
	case "large":
		v.LargeCount.Inc()
		v.LargeSumNS.Add(ns)
	case "huge":
		v.HugeCount.Inc()
		v.HugeSumNS.Add(ns)
	default:
		v.MediumCount.Inc()
		v.MediumSumNS.Add(ns)
	}
}

func (v *VisualDiffBuckets) Snapshot() (smallN, smallSum, medN, medSum, largeN, largeSum, hugeN, hugeSum uint64) {
	return v.SmallCount.Value(), v.SmallSumNS.Value(),
		v.MediumCount.Value(), v.MediumSumNS.Value(),
		v.LargeCount.Value(), v.LargeSumNS.Value(),
		v.HugeCount.Value(), v.HugeSumNS.Value()
}

func (h *HotReloadBuckets) Inc(resource, result string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	var m map[string]*Counter
	switch result {
	case "success":
		if h.Success == nil {
			h.Success = map[string]*Counter{}
		}
		m = h.Success
	case "fail":
		if h.Fail == nil {
			h.Fail = map[string]*Counter{}
		}
		m = h.Fail
	default:
		return
	}
	c, ok := m[resource]
	if !ok {
		c = new(Counter)
		m[resource] = c
	}
	c.Inc()
}

// Snapshot returns per-resource counters in a stable slice for the
// scrape handler to publish.
func (h *HotReloadBuckets) Snapshot() (resources []string, success, fail map[string]uint64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := map[string]bool{}
	for r := range h.Success {
		seen[r] = true
	}
	for r := range h.Fail {
		seen[r] = true
	}
	resources = make([]string, 0, len(seen))
	for r := range seen {
		resources = append(resources, r)
	}
	sort.Strings(resources)
	success = map[string]uint64{}
	fail = map[string]uint64{}
	for _, r := range resources {
		if c, ok := h.Success[r]; ok {
			success[r] = c.Value()
		}
		if c, ok := h.Fail[r]; ok {
			fail[r] = c.Value()
		}
	}
	return resources, success, fail
}

// Registry is the single shared state for all metrics.
type Registry struct {
	Vetter       VetterBuckets
	Sign         SignBuckets
	Vault        VaultBuckets
	ExpertInbox  ExpertInboxGauge
	HotReload    HotReloadBuckets
	VisualDiff   VisualDiffBuckets
	SelfImproving SelfImprovingBuckets
	PMSop        PMSopBuckets
	Canvas       CanvasBuckets
	SubAgent     SubAgentBuckets
	SessionSync  SessionSync
	processStart time.Time
}

// CanvasBuckets counts canvas comment lifecycle events.
type CanvasBuckets struct {
	Created         Counter
	Edited          Counter
	Resolved        Counter
	Deleted         Counter
	CommentsExpired Counter
}

func (c *CanvasBuckets) Inc(action string) {
	switch action {
	case "created":
		c.Created.Inc()
	case "edited":
		c.Edited.Inc()
	case "resolved":
		c.Resolved.Inc()
	case "deleted":
		c.Deleted.Inc()
	case "expired":
		c.CommentsExpired.Add(1)
	}
}

func (c *CanvasBuckets) Snapshot() (created, edited, resolved, deleted, expired uint64) {
	return c.Created.Value(), c.Edited.Value(), c.Resolved.Value(), c.Deleted.Value(), c.CommentsExpired.Value()
}

// PMSopBuckets counts PM plan creations and event types applied.
type PMSopBuckets struct {
	Created  Counter
	Started  Counter
	Complete Counter
	Block    Counter
	Unblock  Counter
	Note     Counter
}

func (p *PMSopBuckets) Inc(action string) {
	switch action {
	case "created":
		p.Created.Inc()
	case "task.start":
		p.Started.Inc()
	case "task.complete":
		p.Complete.Inc()
	case "task.block":
		p.Block.Inc()
	case "task.unblock":
		p.Unblock.Inc()
	case "task.note":
		p.Note.Inc()
	}
}

func (p *PMSopBuckets) Snapshot() (created, started, complete, block, unblock, note uint64) {
	return p.Created.Value(), p.Started.Value(), p.Complete.Value(), p.Block.Value(), p.Unblock.Value(), p.Note.Value()
}

// SelfImprovingBuckets counts SOP generation verdicts.
type SelfImprovingBuckets struct {
	Created  Counter
	Merged   Counter
	Rejected Counter
}

func (s *SelfImprovingBuckets) Inc(verdict string) {
	switch verdict {
	case "created":
		s.Created.Inc()
	case "merged":
		s.Merged.Inc()
	case "rejected":
		s.Rejected.Inc()
	}
}

func (s *SelfImprovingBuckets) Snapshot() (created, merged, rejected uint64) {
	return s.Created.Value(), s.Merged.Value(), s.Rejected.Value()
}

// Global is the default registry. All call sites use it directly so the
// scrape handler can find values without indirection.
var Global = &Registry{processStart: time.Now()}

// SessionSync tracks cross-tab clock skew reported by the FE BroadcastChannel
// layer. The FE calls POST /api/metrics/session-sync-skew with observed skew;
// the server aggregates into a simple histogram (count + sum + max) and
// emits `de_session_sync_skew_ms` in the scrape output.
type SessionSync struct {
	Count    Counter
	SumMS    Counter
	MaxMS    Counter
}

func (s *SessionSync) Observe(skewMS int64) {
	if skewMS < 0 {
		skewMS = -skewMS
	}
	s.Count.Inc()
	s.SumMS.Add(uint64(skewMS))
	for {
		old := s.MaxMS.Value()
		if uint64(skewMS) <= old {
			return
		}
		if s.MaxMS.CAS(old, uint64(skewMS)) {
			return
		}
	}
}

func (s *SessionSync) Snapshot() (count, sumMS, maxMS uint64) {
	return s.Count.Value(), s.SumMS.Value(), s.MaxMS.Value()
}

// SubAgentBuckets tracks the multi-agent dispatch primitive: total run
// wall-clock seconds and per-status run counts. status ∈
// {"success","refused","timed_out","failed"}.
type SubAgentBuckets struct {
	TotalCount       Counter
	TotalSumNS       Counter
	SuccessCount     Counter
	RefusedCount     Counter
	TimedOutCount    Counter
	FailedCount      Counter
}

// Observe records one subagent task outcome.
func (s *SubAgentBuckets) Observe(d time.Duration, status string) {
	s.TotalCount.Inc()
	s.TotalSumNS.Add(uint64(d.Nanoseconds()))
	switch status {
	case "refused":
		s.RefusedCount.Inc()
	case "timed_out":
		s.TimedOutCount.Inc()
	case "failed":
		s.FailedCount.Inc()
	default:
		s.SuccessCount.Inc()
	}
}

// Snapshot returns totals for the scrape handler.
func (s *SubAgentBuckets) Snapshot() (count, sumNS, success, refused, timedOut, failed uint64) {
	return s.TotalCount.Value(), s.TotalSumNS.Value(),
		s.SuccessCount.Value(), s.RefusedCount.Value(),
		s.TimedOutCount.Value(), s.FailedCount.Value()
}

// ProcessStart returns when the registry was created. Used by the scrape
// handler for the uptime metric.
func (r *Registry) ProcessStart() time.Time { return r.processStart }