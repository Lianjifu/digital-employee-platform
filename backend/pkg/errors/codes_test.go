package errors

import (
	"strings"
	"testing"
)

func TestAgentOSKernelCodes(t *testing.T) {
	codes := []Code{
		SessionClosed, SessionHandoff, ReplayNotFound, SnapshotNotFound,
		ChannelThreadUnbound, RuntimeUnavailable, ContextInvalid, IdentityMockForbidden,
		EvalSetRequired, EvalSetFailed, ReplicaStandby, CountersignRequired,
	}
	for _, c := range codes {
		if !strings.HasPrefix(string(c), "E_") {
			t.Fatalf("%s", c)
		}
		if err := Unavailable(RuntimeUnavailable, "runtime down"); c == RuntimeUnavailable && err.Status != 503 {
			t.Fatalf("unavailable status %d", err.Status)
		}
	}
	if IdentityMockForbidden != "E_IDENTITY_MOCK_FORBIDDEN" {
		t.Fatal(IdentityMockForbidden)
	}
}
