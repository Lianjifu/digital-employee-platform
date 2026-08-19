package server

import "testing"

func TestOwnsShareAndAttachments(t *testing.T) {
	for _, mode := range []ServiceMode{ModeCollab, ModeApp} {
		for _, p := range []string{"/api/share/tok", "/api/attachments/a.bin", "/api/sessions/s1/share", "/api/internal/channel-sessions"} {
			if !mode.OwnsPath(p) {
				t.Fatalf("%s should own %s", mode, p)
			}
		}
	}
	if !ModeCap.OwnsPath("/api/internal/skill-catalog") {
		t.Fatal("skill-catalog should be owned by cap")
	}
	if ModeWorkflow.OwnsPath("/api/internal/skill-catalog") {
		t.Fatal("workflow must not own cap skill-catalog")
	}
}
