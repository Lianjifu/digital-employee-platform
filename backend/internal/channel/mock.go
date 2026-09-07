package channel

import (
	"context"
	"sync"
	"time"
)

// MockAdapter is an in-memory Adapter used by tests and local dev. Each kind
// (feishu, wecom, dingtalk, weixin) can be wired independently with its own
// canned behavior for SendText / Probe / ParseInbound.
type MockAdapter struct {
	kind      Kind
	probeOK   bool
	probeName string
	sendOK    bool
	failText  string

	mu          sync.Mutex
	Sent        []MockSent
	InboundHits [][]byte
	ProbeCalls  int
	VerifyCalls int
}

// MockSent captures one SendText invocation.
type MockSent struct {
	ToUser string `json:"toUser"`
	Text   string `json:"text"`
	At     time.Time `json:"at"`
}

// NewMock builds a mock that succeeds by default.
func NewMock(kind Kind) *MockAdapter {
	return &MockAdapter{kind: kind, probeOK: true, probeName: "mock-bot-" + string(kind), sendOK: true}
}

// Kind returns the kind.
func (m *MockAdapter) Kind() Kind { return m.kind }

// SetProbe configures the canned probe result.
func (m *MockAdapter) SetProbe(ok bool, name, detail string) {
	m.probeOK = ok
	m.probeName = name
	m.failText = detail
}

// SetSend configures the canned send result.
func (m *MockAdapter) SetSend(ok bool, failText string) {
	m.sendOK = ok
	m.failText = failText
}

// Probe records a call and returns the canned ProbeResult.
func (m *MockAdapter) Probe(ctx context.Context, credJSON string) ProbeResult {
	m.mu.Lock()
	m.ProbeCalls++
	m.mu.Unlock()
	return ProbeResult{
		OK:        m.probeOK,
		Channel:   m.kind,
		BotName:   m.probeName,
		Detail:    m.failText,
		ProbedAt:  time.Now().UTC(),
		LatencyMs: 1,
	}
}

// SendText records a call and returns a deterministic message id.
func (m *MockAdapter) SendText(ctx context.Context, credJSON, toUser, text string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Sent = append(m.Sent, MockSent{ToUser: toUser, Text: text, At: time.Now().UTC()})
	if !m.sendOK {
		return "", &ChannelError{Kind: m.kind, Reason: m.failText}
	}
	return "mock-" + string(m.kind) + "-msg", nil
}

// Verify records the call; the mock always succeeds.
func (m *MockAdapter) Verify(credJSON string, headers map[string]string, body []byte) error {
	m.mu.Lock()
	m.VerifyCalls++
	m.mu.Unlock()
	return nil
}

// ParseInbound records the body and returns a canonical event built from
// the mock's kind. The mock always succeeds; tests that need invalid input
// can replace this with their own Adapter implementation.
func (m *MockAdapter) ParseInbound(credJSON string, body []byte) (InboundEvent, error) {
	m.mu.Lock()
	m.InboundHits = append(m.InboundHits, body)
	m.mu.Unlock()
	return InboundEvent{
		Channel:    m.kind,
		MessageID:  "mock-msg",
		SenderID:   "mock-user",
		ChatID:     "mock-chat",
		ChatType:   "direct",
		Text:       string(body),
		Raw:        body,
		ReceivedAt: time.Now().UTC(),
	}, nil
}

// ChannelError is a structured error returned by mock adapters.
type ChannelError struct {
	Kind   Kind
	Reason string
}

// Error implements error.
func (e *ChannelError) Error() string { return string(e.Kind) + ": " + e.Reason }

// NewDefaultRegistry returns a Registry pre-loaded with mocks for all four
// kinds. Tests can then override individual adapters with Register.
func NewDefaultRegistry() *Registry {
	r := NewRegistry()
	r.Register(NewMock(KindFeishu))
	r.Register(NewMock(KindWecom))
	r.Register(NewMock(KindDingtalk))
	r.Register(NewMock(KindWeixin))
	return r
}
