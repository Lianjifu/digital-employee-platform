package server

import "testing"

func TestOwnsShareAndAttachments(t *testing.T) {
	m := ModeCollab
	for _, p := range []string{"/api/share/tok", "/api/attachments/a.bin", "/api/sessions/s1/share"} {
		if !m.OwnsPath(p) {
			t.Fatalf("%s should be owned by collab", p)
		}
	}
}
