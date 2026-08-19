package server

import (
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

// requireProductionDualApproval enforces SoD on production writes (上岗/路由/知识/恢复).
// Non-production keeps the existing single-actor path for local DX.
func requireProductionDualApproval(submitterID, submitterName string, actor *auth.Identity, verb string) error {
	if !productionLikeEnv() {
		return nil
	}
	if actor == nil {
		return apperr.UnauthorizedErr("未登录")
	}
	if actor.Role == "admin" {
		return nil
	}
	if submitterID == "" && submitterName == "" {
		return nil
	}
	if submitterID != "" && submitterID == actor.ID {
		return apperr.Forbidden(apperr.SODSelfApproval, "生产"+verb+"须双人审批，申请人不能自批")
	}
	if submitterName != "" && submitterName == actor.Name {
		return apperr.Forbidden(apperr.SODSelfApproval, "生产"+verb+"须双人审批，申请人不能自批")
	}
	return nil
}

func highRiskNeedsCountersign(riskOrClass string) bool {
	if !productionLikeEnv() {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(riskOrClass)) {
	case "high", "restricted", "confidential", "secret":
		return true
	default:
		return false
	}
}

// maybeHoldForCountersign records the first high-risk approver and returns hold=true
// until a second distinct signer arrives. entity is a release/package/policy map.
func maybeHoldForCountersign(entity map[string]any, actor *auth.Identity, risk, verb string) (hold bool, err error) {
	if entity == nil || actor == nil || !highRiskNeedsCountersign(risk) {
		return false, nil
	}
	if str(entity["status"]) == "pending_countersign" {
		firstID, firstName := str(entity["firstApproverId"]), str(entity["firstApprover"])
		if firstID != "" && firstID == actor.ID {
			return false, apperr.Forbidden(apperr.SODSelfApproval, "生产"+verb+"会签须另一人副署")
		}
		if firstID == "" && firstName != "" && firstName == actor.Name {
			return false, apperr.Forbidden(apperr.SODSelfApproval, "生产"+verb+"会签须另一人副署")
		}
		entity["countersigner"] = actor.Name
		entity["countersignerId"] = actor.ID
		entity["countersignedAt"] = time.Now().UTC().Format(time.RFC3339)
		return false, nil
	}
	entity["status"] = "pending_countersign"
	entity["firstApprover"] = actor.Name
	entity["firstApproverId"] = actor.ID
	entity["firstApprovedAt"] = time.Now().UTC().Format(time.RFC3339)
	return true, nil
}
