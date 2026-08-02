package de.authz

import future.keywords.if
import future.keywords.in

# Queried via: POST /v1/data/de/authz/result  {"input":{...}}
result := decide

decide := {
	"allow": false,
	"reason": "审计角色只读",
	"policyId": "baseline.auditor_readonly",
	"requireDualSign": false,
} if {
	input.actorRole == "auditor"
	not read_action
} else := {
	"allow": false,
	"reason": "受限数据禁止外部出口",
	"policyId": "baseline.restricted_egress",
	"requireDualSign": false,
} if {
	input.dataClass == "restricted"
	input.egressExternal == true
	risky_resource
} else := {
	"allow": false,
	"reason": "职责分离：提交人不可自批",
	"policyId": "baseline.sod",
	"requireDualSign": true,
} if {
	sensitive_action
	input.submitterId != ""
	input.approverId != ""
	input.submitterId == input.approverId
} else := {
	"allow": false,
	"reason": "发布/批准需要管理员",
	"policyId": "baseline.release_admin",
	"requireDualSign": true,
} if {
	sensitive_action
	input.actorRole != "admin"
} else := {
	"allow": false,
	"reason": "仅可绑定已发布能力版本",
	"policyId": "baseline.published_binding",
	"requireDualSign": false,
} if {
	binding_resource
	input.action == "bind"
	input.publishedBinding == false
} else := {
	"allow": true,
	"reason": "allow",
	"policyId": "baseline.default_allow",
	"requireDualSign": false,
}

read_action if {
	a := lower(input.action)
	a in {"read", "list", "get", "export"}
}

sensitive_action if {
	a := lower(input.action)
	a in {"approve", "publish", "release"}
}

risky_resource if {
	input.resource in {"model", "channel"}
}

binding_resource if {
	input.resource in {"employee_binding", "capability"}
}
