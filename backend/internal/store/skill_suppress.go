package store

import "strings"

func skillSuppressKey(ws, name string) string {
	return strings.ToLower(strings.TrimSpace(ws)) + "|" + strings.ToLower(strings.TrimSpace(name))
}

// SkillSuppressed reports whether a skill was explicitly uninstalled for the workspace.
func (s *Store) SkillSuppressed(ws, skillNameOrID string) bool {
	s.RLock()
	defer s.RUnlock()
	return s.skillSuppressedLocked(ws, skillNameOrID)
}

func (s *Store) skillSuppressedLocked(ws, skillNameOrID string) bool {
	if s.SkillExtra == nil || strings.TrimSpace(skillNameOrID) == "" {
		return false
	}
	m, _ := s.SkillExtra["suppressed"].(map[string]any)
	if m == nil {
		return false
	}
	v, ok := m[skillSuppressKey(ws, skillNameOrID)]
	if !ok {
		return false
	}
	b, _ := v.(bool)
	return b
}

// RecordSkillSuppressed marks a skill as user-uninstalled so boot-time ensure hooks skip re-install.
func (s *Store) RecordSkillSuppressed(ws, skillNameOrID string) {
	s.Lock()
	defer s.Unlock()
	s.recordSkillSuppressedLocked(ws, skillNameOrID)
}

// SkillSuppressedUnlocked reports suppression; caller must hold Store read or write lock.
func (s *Store) SkillSuppressedUnlocked(ws, skillNameOrID string) bool {
	return s.skillSuppressedLocked(ws, skillNameOrID)
}

// RecordSkillSuppressedUnlocked records suppression; caller must hold Store write lock.
func (s *Store) RecordSkillSuppressedUnlocked(ws, skillNameOrID string) {
	s.recordSkillSuppressedLocked(ws, skillNameOrID)
}

func (s *Store) recordSkillSuppressedLocked(ws, skillNameOrID string) {
	if strings.TrimSpace(skillNameOrID) == "" {
		return
	}
	if s.SkillExtra == nil {
		s.SkillExtra = map[string]any{}
	}
	m, _ := s.SkillExtra["suppressed"].(map[string]any)
	if m == nil {
		m = map[string]any{}
		s.SkillExtra["suppressed"] = m
	}
	m[skillSuppressKey(ws, skillNameOrID)] = true
}
