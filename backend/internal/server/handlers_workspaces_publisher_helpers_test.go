package server

import "crypto/ed25519"

// Test-only export helpers — exposed to the server_test package so
// publisher-key tests can drive Server internals without faking HTTP.

func (s *Server) ResolvePublisherKeyForTest(wsID, keyID string) (ed25519.PublicKey, string, error) {
	return s.resolvePublisherKey(wsID, keyID)
}

func (s *Server) AuditsForTest() []map[string]any {
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0, len(s.Store.Audits))
	for _, a := range s.Store.Audits {
		cp := make(map[string]any, len(a))
		for k, v := range a {
			cp[k] = v
		}
		out = append(out, cp)
	}
	return out
}
