package server

import (
	"context"
	"net/http"

	"github.com/digital-employee-platform/backend/internal/depolicy"
	"github.com/digital-employee-platform/backend/internal/policy"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// evaluateWrite runs policy (remote de-policy when DE_POLICY_URL set) and audits the decision.
func (s *Server) evaluateWrite(r *http.Request, resource, action string, extra policy.Input) error {
	s.Store.Lock()
	defer s.Store.Unlock()
	return s.evaluateWriteLocked(r, resource, action, extra)
}

// evaluateWriteLocked is for callers that already hold Store.Lock.
func (s *Server) evaluateWriteLocked(r *http.Request, resource, action string, extra policy.Input) error {
	id := identityFrom(r.Context())
	if id == nil {
		return apperr.UnauthorizedErr("未登录")
	}
	in := extra
	in.ActorID = id.ID
	in.ActorRole = id.Role
	in.WorkspaceID = s.workspaceID(r)
	in.Resource = resource
	in.Action = action
	if in.ApproverID == "" {
		in.ApproverID = id.ID
	}
	dec := s.decidePolicy(r.Context(), in)
	result := "allow"
	if !dec.Allow {
		result = "deny"
		IncPolicyDeny()
	}
	s.Store.AppendAudit(in.WorkspaceID, id.Name, "policy:"+action, resource, result, dec.Reason)
	// Durable sink is covered by Store auditHook fanout; avoid duplicate Append under lock.
	if !dec.Allow {
		return apperr.Forbidden(apperr.RoleForbidden, dec.Reason)
	}
	return nil
}

// decidePolicy prefers peer de-policy (DE_POLICY_URL), else Engine (OPA/local).
func (s *Server) decidePolicy(ctx context.Context, in policy.Input) policy.Decision {
	if c := depolicy.NewClientFromEnv(); c.Available() {
		if d, err := c.Evaluate(ctx, in); err == nil {
			return d
		}
	}
	return s.Policy.Evaluate(ctx, in)
}
