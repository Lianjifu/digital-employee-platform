package store

// DefaultEmployeeReplyMode is the platform default for digital employee copilot replies.
const DefaultEmployeeReplyMode = "segmented"

// DefaultEmployeeSegmentPolicy controls when multi-bubble splits are allowed.
// document: one body bubble for full docs; conversational: optional short lead-in via <<<NEXT>>>.
const DefaultEmployeeSegmentPolicy = "document"

// ApplyDefaultReplyModeRuntime sets runtime.replyMode when unset.
func ApplyDefaultReplyModeRuntime(emp map[string]any) {
	if emp == nil {
		return
	}
	rt, _ := emp["runtime"].(map[string]any)
	if rt == nil {
		rt = map[string]any{}
		emp["runtime"] = rt
	}
	if str(rt["replyMode"]) == "" {
		rt["replyMode"] = DefaultEmployeeReplyMode
	}
	if str(rt["segmentPolicy"]) == "" {
		rt["segmentPolicy"] = DefaultEmployeeSegmentPolicy
	}
}

// EnsureEmployeesReplyModeDefaults backfills replyMode for all employees.
func (s *Store) EnsureEmployeesReplyModeDefaults() {
	s.Lock()
	defer s.Unlock()
	s.ensureEmployeesReplyModeDefaultsLocked()
}

func (s *Store) ensureEmployeesReplyModeDefaultsLocked() {
	for i := range s.Employees {
		ApplyDefaultReplyModeRuntime(s.Employees[i])
	}
}
