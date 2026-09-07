package channel

import (
	"context"
	"sort"
	"sync"
)

// Registry maps a Kind to its Adapter. Use NewRegistry to build one and
// Register to attach each adapter. The default registry built by
// NewDefaultRegistry includes all four vendor adapters.
type Registry struct {
	mu       sync.RWMutex
	adapters map[Kind]Adapter
}

// NewRegistry returns an empty Registry.
func NewRegistry() *Registry {
	return &Registry{adapters: map[Kind]Adapter{}}
}

// Register installs an adapter under its Kind.
func (r *Registry) Register(a Adapter) {
	if a == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.adapters[a.Kind()] = a
}

// For returns the adapter for the given kind, or nil if unregistered.
func (r *Registry) For(k Kind) Adapter {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.adapters[k]
}

// Kinds returns the registered kinds, sorted alphabetically.
func (r *Registry) Kinds() []Kind {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Kind, 0, len(r.adapters))
	for k := range r.adapters {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// SendText is a convenience that looks up the adapter for k and delegates.
func (r *Registry) SendText(ctx context.Context, k Kind, credJSON, toUser, text string) (string, error) {
	a := r.For(k)
	if a == nil {
		return "", ErrUnsupported
	}
	return a.SendText(ctx, credJSON, toUser, text)
}

// Probe is a convenience that looks up the adapter for k and delegates.
func (r *Registry) Probe(ctx context.Context, k Kind, credJSON string) ProbeResult {
	a := r.For(k)
	if a == nil {
		return ProbeResult{OK: false, Channel: k, Detail: "adapter not registered"}
	}
	return a.Probe(ctx, credJSON)
}

// ParseInbound is a convenience that looks up the adapter for k and delegates.
func (r *Registry) ParseInbound(k Kind, credJSON string, body []byte) (InboundEvent, error) {
	a := r.For(k)
	if a == nil {
		return InboundEvent{}, ErrUnsupported
	}
	return a.ParseInbound(credJSON, body)
}

// Verify is a convenience that looks up the adapter for k and delegates.
func (r *Registry) Verify(k Kind, credJSON string, headers map[string]string, body []byte) error {
	a := r.For(k)
	if a == nil {
		return ErrUnsupported
	}
	return a.Verify(credJSON, headers, body)
}
