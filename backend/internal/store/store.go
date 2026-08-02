package store

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

// Store is an in-memory control-plane state (Phase A–C default; PG later).
type Store struct {
	mu sync.RWMutex
	seq atomic.Uint64

	Workspaces       []map[string]any
	SwitchHistory    []map[string]any
	Members          map[string][]map[string]any
	Quotas           map[string]map[string]any
	Bindings         []map[string]any
	Environments     []map[string]any
	WorkspacePolicy  map[string]map[string]any
	Audits           []map[string]any
	ZTPolicies       []map[string]any
	ZTEvents         []map[string]any
	TempAuths        []map[string]any
	AccessGrants     []map[string]any
	AccessReviews    []map[string]any
	SodRules         []map[string]any
	ReleaseApprovals []map[string]any

	Employees         []map[string]any
	EmployeeTemplates []map[string]any
	TemplateAdoptions []map[string]any
	CapabilityCatalog map[string]any
	ConfigVersions    []map[string]any
	ConfigDrafts      map[string]map[string]any
	Tasks             []map[string]any

	ModelProviders  []map[string]any
	RoutingPolicies []map[string]any
	PolicyVersions  []map[string]any
	ModelAudit      []map[string]any
	ModelRoutes     []map[string]any
	ModelBudgets    []map[string]any
	UsageMeters     []map[string]any
	KnowledgeDocs   []map[string]any
	KBList          []map[string]any
	KnowledgeExtra  map[string]any // packages, sources, governance, …
	Conversations   []map[string]any
	Messages        map[string][]map[string]any
	Sessions        []map[string]any
	SlashCommands   []map[string]any

	Workflows       []map[string]any
	WorkflowSkills  []map[string]any
	WorkflowRuns    []map[string]any
	WorkflowVersions map[string][]map[string]any
	WorkflowGens    []map[string]any
	WorkflowTpls    []map[string]any
	Skills          []map[string]any
	SkillCatalog    []map[string]any
	SkillGovernance map[string]any
	MemoryRecords   []map[string]any
	MemoryCands     []map[string]any
	MemoryPolicies  map[string]map[string]any
	MemoryAudits    []map[string]any
	Channels        []map[string]any
	ChannelDeploys  []map[string]any
	DeliveryPolicies []map[string]any
	ChannelTemplates []map[string]any
	ChannelBlacklist []map[string]any
	ChannelAudit    []map[string]any
	ChannelDLQ      []map[string]any

	HomeKPIs             map[string]any
	HomeExtra            map[string]any
	HomeAlerts           []map[string]any
	Billing              map[string]any
	Backups              []map[string]any
	OpsOverview          map[string]any
	NotificationChannels []map[string]any
	APIKeys              []map[string]any
	WebhooksConfig       []map[string]any
	TenantProfile        map[string]any
	// ActorExtraWorkspaces tracks workspaces granted after login (e.g. create).
	ActorExtraWorkspaces map[string][]string

	// Optional hook for durable audit sink (Postgres via Docker).
	auditHook func(map[string]any)
	// Optional durable collection snapshot (platform.kv_documents).
	persistHook PersistFunc
}

func New() *Store {
	s := &Store{
		Members:          map[string][]map[string]any{},
		Quotas:           map[string]map[string]any{},
		WorkspacePolicy:  map[string]map[string]any{},
		ConfigDrafts:     map[string]map[string]any{},
		Messages:         map[string][]map[string]any{},
		MemoryPolicies:   map[string]map[string]any{},
		WorkflowVersions: map[string][]map[string]any{},
		KnowledgeExtra:   map[string]any{},
		ActorExtraWorkspaces: map[string][]string{},
		TenantProfile: map[string]any{
			"name": "ACME Corp", "tenantId": "tenant-acme", "region": "cn-east-1",
			"createdAt": "2024-03-12", "status": "active",
		},
		SkillGovernance:  map[string]any{},
	}
	s.seed()
	return s
}

func (s *Store) Lock()    { s.mu.Lock() }
func (s *Store) Unlock()  { s.mu.Unlock() }
func (s *Store) RLock()   { s.mu.RLock() }
func (s *Store) RUnlock() { s.mu.RUnlock() }

func (s *Store) ID(prefix string) string {
	n := s.seq.Add(1)
	return fmt.Sprintf("%s-%d", prefix, n)
}

func now() string { return time.Now().UTC().Format(time.RFC3339) }

func controlledTask(id, ws, code, title, priority, status, stage, ownerID, deID, source string) map[string]any {
	return map[string]any{
		"id": id, "workspaceId": ws, "code": code, "title": title, "priority": priority,
		"status": status, "lifecycleStage": stage, "ownerId": ownerID, "digitalEmployeeId": deID,
		"digitalEmployeeName": "数字员工", "assignee": ownerID, "source": source,
		"progress": map[string]any{"done": 1, "total": 3}, "tags": []string{},
		"sla": map[string]any{"remainingMin": 45, "risk": "none", "escalated": false},
		"execution": map[string]any{"retryCount": 0, "paused": false, "currentStep": "执行中"},
		"governance": map[string]any{"approvalRequired": false, "approvalStatus": "not_required"},
		"createdAt": "2026-07-22T01:00:00Z", "updatedAt": "2026-07-22T08:00:00Z",
		"environment": "sandbox", "classification": "internal", "createdBy": ownerID,
	}
}

func (s *Store) SetAuditHook(fn func(map[string]any)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.auditHook = fn
}

func (s *Store) AppendAudit(workspaceID, actor, action, target string, result string, reason string) map[string]any {
	ev := map[string]any{
		"id": s.ID("audit"), "workspaceId": workspaceID, "time": now(),
		"actor": actor, "action": action, "target": target,
		"result": result, "reason": reason, "correlationId": s.ID("corr"),
	}
	s.Audits = append([]map[string]any{ev}, s.Audits...)
	if s.auditHook != nil {
		s.auditHook(ev)
	}
	return ev
}

func (s *Store) seed() {
	s.Workspaces = []map[string]any{
		{"id": "w1", "tenantId": "tenant-acme", "ownerId": "u1", "status": "active", "name": "ACME 生产", "region": "cn-east-1", "plan": "enterprise_plus", "memberCount": 18, "complianceScore": 98, "createdAt": "2024-03-12T00:00:00Z"},
		{"id": "w2", "tenantId": "tenant-acme", "ownerId": "u1", "status": "active", "name": "ACME 预发", "region": "cn-east-1", "plan": "enterprise", "memberCount": 6, "complianceScore": 92, "createdAt": "2024-05-08T00:00:00Z"},
		{"id": "w3", "tenantId": "tenant-acme", "ownerId": "u1", "status": "active", "name": "ACME 安全", "region": "cn-east-1", "plan": "enterprise_plus", "memberCount": 4, "complianceScore": 100, "createdAt": "2024-06-01T00:00:00Z"},
		{"id": "w4", "tenantId": "tenant-acme", "ownerId": "u1", "status": "active", "name": "外协沙箱", "region": "cn-south-1", "plan": "standard", "memberCount": 2, "complianceScore": 85, "createdAt": "2025-01-15T00:00:00Z"},
	}
	s.SwitchHistory = []map[string]any{
		{"id": "sw1", "workspaceId": "w1", "workspaceName": "ACME 生产", "switchedAt": "2026-07-22T08:00:00Z", "actor": "平台管理员"},
		{"id": "sw2", "workspaceId": "w2", "workspaceName": "ACME 预发", "switchedAt": "2026-07-21T10:00:00Z", "actor": "业务构建者"},
	}
	s.Members["w1"] = []map[string]any{
		{"id": "m1", "workspaceId": "w1", "name": "平台管理员", "email": "admin@acme.com", "role": "admin", "mfa": true, "lastActive": "刚刚"},
		{"id": "m2", "workspaceId": "w1", "name": "业务构建者", "email": "user@acme.com", "role": "builder", "mfa": true, "lastActive": "5 分钟前"},
	}
	s.Quotas["w1"] = map[string]any{
		"workspaceId": "w1",
		"seats": map[string]any{"used": 18, "limit": 50},
		"agents": map[string]any{"used": 6, "limit": 20},
		"concurrency": map[string]any{"used": 4, "limit": 20},
		"tokens": map[string]any{"used": 1240000, "limit": 5000000},
		"budgetUsd": map[string]any{"used": 1240, "limit": 3000},
	}
	s.Bindings = []map[string]any{
		{"id": "wb1", "workspaceId": "w1", "environment": "production", "kind": "agent", "name": "故障自愈", "status": "active"},
		{"id": "wb2", "workspaceId": "w1", "environment": "production", "kind": "model", "name": "P0 路由策略", "status": "active"},
	}
	for _, kind := range []string{"sandbox", "staging", "production"} {
		canary := 100
		if kind == "production" {
			canary = 10
		}
		s.Environments = append(s.Environments, map[string]any{
			"id": "w1-" + kind, "workspaceId": "w1", "kind": kind,
			"approvalRequired": kind == "production", "canaryPercent": canary, "status": "ready",
		})
	}
	s.WorkspacePolicy["w1"] = map[string]any{
		"workspaceId": "w1", "dataClassification": "restricted", "egressAllowed": false,
		"toolAllowlist": []string{"kubectl", "cmdb-tool"}, "retentionDays": 365, "exceptionStatus": "none",
	}

	s.ZTPolicies = []map[string]any{
		{"id": "zt-user-production", "name": "普通用户生产变更门禁", "resource": "workflow", "action": "publish", "scope": "production", "condition": "角色为普通用户", "decision": "approval_required", "enabled": true, "baseline": true, "version": 3, "updatedAt": "2026-07-22T00:00:00Z", "updatedBy": "平台管理员"},
		{"id": "zt-restricted-egress", "name": "受限数据禁止外部出口", "resource": "model", "action": "run", "scope": "external_egress", "condition": "数据分类为受限", "decision": "deny", "enabled": true, "baseline": true, "version": 5, "updatedAt": "2026-07-22T00:00:00Z", "updatedBy": "安全管理员"},
		{"id": "zt-memory-governance", "name": "记忆治理管理员专属", "resource": "memory", "action": "write", "scope": "workspace", "condition": "修改保留、提炼或审核策略", "decision": "deny", "enabled": true, "baseline": true, "version": 2, "updatedAt": "2026-07-22T00:00:00Z", "updatedBy": "平台管理员"},
		{"id": "zt-tool-approval", "name": "高风险工具调用复核", "resource": "skill", "action": "run", "scope": "production", "condition": "高风险或写操作工具", "decision": "approval_required", "enabled": true, "baseline": true, "version": 4, "updatedAt": "2026-07-22T00:00:00Z", "updatedBy": "安全管理员"},
		{"id": "zt-auditor-readonly", "name": "审计角色只读", "resource": "export", "action": "write", "scope": "tenant", "condition": "角色为审计用户", "decision": "deny", "enabled": true, "baseline": true, "version": 1, "updatedAt": "2026-07-22T00:00:00Z", "updatedBy": "平台管理员"},
	}
	s.ZTEvents = []map[string]any{
		{"id": "zt-event-1", "time": "2026-07-22T08:12:00Z", "tenantId": "tenant-acme", "workspaceId": "w1", "actor": "业务构建者", "resource": "memory", "action": "write", "classification": "internal", "decision": "deny", "policyId": "zt-memory-governance", "reason": "普通用户不能修改记忆治理策略", "correlationId": "corr-zt-memory-1"},
	}
	s.TempAuths = []map[string]any{
		{"id": "zta-1", "subjectId": "u2", "subjectName": "业务构建者", "workspaceId": "w2", "environment": "staging", "resource": "workflow", "action": "run", "reason": "预发回归验证", "status": "active", "expiresAt": "2026-12-24T18:00:00Z", "approvedBy": "平台管理员"},
	}
	s.AccessGrants = []map[string]any{
		{"id": "grant-admin", "subjectId": "u1", "subjectName": "平台管理员", "role": "admin", "tenantId": "tenant-acme", "workspaceIds": []string{"w1", "w2", "w3", "w4"}, "environmentScopes": []string{"sandbox", "staging", "production"}, "status": "active", "grantedBy": "系统初始化", "createdAt": "2026-07-01T08:00:00Z"},
		{"id": "grant-user", "subjectId": "u2", "subjectName": "业务构建者", "role": "user", "tenantId": "tenant-acme", "workspaceIds": []string{"w1", "w2"}, "environmentScopes": []string{"sandbox", "staging"}, "status": "active", "grantedBy": "平台管理员", "createdAt": "2026-07-02T08:00:00Z"},
		{"id": "grant-auditor", "subjectId": "u3", "subjectName": "合规审计员", "role": "auditor", "tenantId": "tenant-acme", "workspaceIds": []string{"w1", "w2", "w3"}, "environmentScopes": []string{"sandbox", "staging", "production"}, "status": "active", "grantedBy": "平台管理员", "createdAt": "2026-07-03T08:00:00Z"},
	}
	s.AccessReviews = []map[string]any{
		{"id": "review-q3", "title": "第三季度生产环境访问复核", "scope": "生产环境 · 3 个工作区", "dueAt": "2026-07-31T23:59:59Z", "status": "open", "owner": "平台管理员", "reviewed": 12, "total": 18},
	}
	s.SodRules = []map[string]any{
		{"id": "sod-self-approval", "title": "创建者不可审批自己的生产发布", "description": "生产环境变更必须由另一名管理员审批。", "scope": "production", "enabled": true, "violations": 0},
		{"id": "sod-audit-readonly", "title": "审计用户只读", "description": "审计用户不得拥有资源编辑、权限配置或发布动作。", "scope": "tenant", "enabled": true, "violations": 0},
	}
	s.ReleaseApprovals = []map[string]any{
		{"id": "approval-agent-21", "workspaceId": "w1", "environment": "production", "resourceType": "agent", "resourceName": "客服质检助手 v2.1", "submittedBy": "业务构建者", "submittedById": "u2", "submittedAt": "2026-07-21T02:30:00Z", "status": "pending", "risk": "medium", "correlationId": "corr-release-agent-21"},
	}
	s.AppendAudit("w1", "系统", "初始化审计", "de-core", "success", "seed")

	s.CapabilityCatalog = map[string]any{
		"models":    []map[string]any{{"id": "mdl-gpt4", "name": "gpt-4o", "meta": "Azure OpenAI CN · cn-east"}},
		"knowledge": []map[string]any{{"id": "pkg-ops", "name": "运维知识库", "meta": "运维 · v3.1.0"}},
		"skills":    []map[string]any{{"id": "sk-1", "name": "kubectl 只读", "meta": "技能 · 0.9.0"}},
		"tools":     []map[string]any{{"id": "tool-cmdb", "name": "CMDB 查询", "meta": "工具 · 1.0.0"}},
		"workflows": []map[string]any{{"id": "wfs-1", "name": "故障自愈技能", "meta": "流程技能 · 1.2.0"}},
		"channels":  []map[string]any{{"id": "ch-1", "name": "企业微信通知", "meta": "渠道 · wecom"}},
	}
	s.EmployeeTemplates = []map[string]any{
		{"id": "tpl-sre", "name": "SRE 值班数字员工", "role": "SRE", "department": "信息技术部", "scope": "organization", "status": "certified", "source": "platform", "sourceName": "平台模板", "description": "故障响应与变更护栏", "serviceObject": "运维团队", "version": "1.0.0", "risk": "medium", "responsibilities": []string{"故障响应", "变更护栏"}, "prohibitedActions": []string{"生产直接写库"}, "capabilities": map[string]any{"model": "gpt-4o", "knowledge": []string{"运维知识库"}, "skills": []string{"kubectl 只读"}, "tools": []string{"CMDB 查询"}, "workflows": []string{"故障自愈技能"}, "channels": []string{"Web"}}, "memoryPolicy": map[string]any{"shortTermHours": 24, "workingDays": 7, "longTermCadence": "daily", "knowledgePromotion": "approval_required"}, "applicableEnvironments": []string{"sandbox", "staging", "production"}, "adoptionCount": 1, "tags": []string{"sre"}, "publishedAt": "2026-07-01T00:00:00Z", "updatedAt": "2026-07-01T00:00:00Z"},
	}
	s.TemplateAdoptions = []map[string]any{
		{"id": "adopt-1", "templateId": "tpl-sre", "templateVersion": "1.0.0", "employeeId": "de-1", "workspaceId": "w1", "adoptedBy": "平台管理员", "status": "active", "createdAt": "2026-07-01T00:00:00Z"},
	}
	s.Employees = []map[string]any{
		{
			"id": "de-1", "workspaceId": "w1", "name": "故障自愈助手", "role": "SRE", "department": "信息技术部",
			"description": "生产故障自愈与护栏", "owner": "平台管理员", "ownerId": "u1", "escalationOwner": "值班经理", "serviceObject": "运维团队",
			"version": "1.0.0", "environment": "production", "lifecycle": "active", "risk": "medium",
			"responsibilities": []string{"故障响应", "变更护栏"}, "prohibitedActions": []string{"生产直接写库"},
			"capabilities": map[string]any{"model": "gpt-4o", "knowledge": []string{"运维知识库"}, "skills": []string{"kubectl 只读"}, "tools": []string{"CMDB 查询"}, "workflows": []string{"故障自愈技能"}, "channels": []string{"Web"}},
			"memoryPolicy": map[string]any{"shortTermHours": 24, "workingDays": 7, "longTermCadence": "daily", "knowledgePromotion": "approval_required"},
			"runtime": map[string]any{"calls24h": 120, "successRate": 0.98, "p95Ms": 420, "costToday": 12.5, "handoffs24h": 2, "anomalies": 0},
			"evaluation": map[string]any{"status": "passed", "score": 94.2, "lastRunAt": "2026-07-20T00:00:00Z"},
			"release": map[string]any{"status": "released", "releasedAt": "2026-07-15T00:00:00Z", "requestedBy": "业务构建者", "requestedById": "u2", "approver": "平台管理员", "approverId": "u1"},
			"templateId": "tpl-sre", "templateVersion": "1.0.0", "updatedAt": "2026-07-20T00:00:00Z",
		},
		{
			"id": "de-2", "workspaceId": "w1", "name": "客服质检助手", "role": "QA", "department": "运营部",
			"description": "会话质检", "owner": "业务构建者", "ownerId": "u2", "escalationOwner": "运营负责人", "serviceObject": "客服团队",
			"version": "2.1.0", "environment": "sandbox", "lifecycle": "pending_approval", "risk": "low",
			"responsibilities": []string{"质检评分"}, "prohibitedActions": []string{"直接对客回复"},
			"capabilities": map[string]any{"model": "gpt-4o", "knowledge": []string{"运维知识库"}, "skills": []string{}, "tools": []string{}, "workflows": []string{}, "channels": []string{"Web"}},
			"memoryPolicy": map[string]any{"shortTermHours": 24, "workingDays": 7, "longTermCadence": "daily", "knowledgePromotion": "approval_required"},
			"runtime": map[string]any{"calls24h": 0, "successRate": 0, "p95Ms": 0, "costToday": 0, "handoffs24h": 0, "anomalies": 0},
			"evaluation": map[string]any{"status": "passed", "score": 92.0, "lastRunAt": "2026-07-21T00:00:00Z"},
			"release": map[string]any{"status": "pending_approval", "requestedBy": "业务构建者", "requestedById": "u2"},
			"updatedAt": "2026-07-21T00:00:00Z",
		},
	}
	s.ConfigVersions = []map[string]any{
		{"id": "cfg-1", "employeeId": "de-1", "version": "配置 v1", "status": "current", "changeSummary": "初始配置", "changedFields": []string{"岗位档案"}, "updatedBy": "平台管理员", "updatedById": "u1", "updatedAt": "2026-07-15T00:00:00Z"},
	}

	s.Tasks = []map[string]any{
		controlledTask("task-1", "w1", "T-1001", "排查缓存延迟", "P1", "in_progress", "running", "u2", "de-1", "alert"),
		controlledTask("task-2", "w1", "T-1002", "复核发布申请", "P2", "review", "human_action", "u1", "de-2", "manual"),
	}

	s.ModelProviders = []map[string]any{
		{"id": "mp-1", "workspaceId": "w1", "name": "Azure OpenAI CN", "tier": "enterprise", "protocol": "azure_openai", "baseUrl": "https://example.openai.azure.com", "cloudRegion": "cn-east", "dataResidency": "cn", "status": "active", "credentialRef": "vault://mp-1", "credentialMasked": "sk-****abcd", "lastVerifiedAt": "2026-07-20T00:00:00Z", "models": []map[string]any{{"id": "mdl-gpt4", "providerId": "mp-1", "name": "gpt-4o", "cloudRegion": "cn-east", "dataResidency": "cn", "capabilities": []string{"chat", "reasoning"}, "status": "available", "contextWindow": 128000}}},
		{"id": "mp-2", "workspaceId": "w1", "name": "本地 Embedding", "tier": "standard", "protocol": "ollama", "baseUrl": "http://127.0.0.1:11434", "cloudRegion": "cn-east", "dataResidency": "cn", "status": "standby", "credentialRef": "", "credentialMasked": "", "models": []map[string]any{{"id": "mdl-emb", "providerId": "mp-2", "name": "bge-m3", "cloudRegion": "cn-east", "dataResidency": "cn", "capabilities": []string{"embedding"}, "status": "available", "contextWindow": 8192}}},
	}
	s.RoutingPolicies = []map[string]any{
		{"id": "rp-p0", "workspaceId": "w1", "level": "P0", "primaryModelId": "mdl-gpt4", "fallbackModelIds": []string{"mdl-emb"}, "dataScope": "internal", "egressAllowed": false, "budgetLimitUsd": 500, "status": "published", "validationIssues": []string{}},
		{"id": "rp-draft", "workspaceId": "w1", "level": "P1", "primaryModelId": "mdl-gpt4", "fallbackModelIds": []string{}, "dataScope": "internal", "egressAllowed": false, "budgetLimitUsd": 200, "status": "draft", "validationIssues": []string{}},
	}
	s.PolicyVersions = []map[string]any{
		{"id": "rpv-1", "policyId": "rp-p0", "version": 1, "snapshot": map[string]any{"id": "rp-p0", "level": "P0"}, "publishedAt": "2026-07-18T00:00:00Z", "publishedBy": "平台管理员"},
	}
	s.ModelAudit = []map[string]any{
		{"id": "ma-1", "time": "2026-07-18T00:00:00Z", "workspaceId": "w1", "actor": "平台管理员", "action": "发布路由策略", "target": "P0", "result": "success", "correlationId": "corr-model-1"},
	}
	s.ModelRoutes = []map[string]any{
		{"id": "mr-p0", "workspaceId": "w1", "name": "P0 对话路由", "level": "P0", "primaryModelId": "mdl-gpt4", "fallbackModelIds": []string{"mdl-emb"}, "budgetLimitUsd": 500, "dataScope": "internal", "egressAllowed": false, "status": "published"},
	}
	s.ModelBudgets = []map[string]any{
		{"workspaceId": "w1", "month": "2026-07", "usedUsd": 124.5, "limitUsd": 500},
	}
	s.KnowledgeDocs = []map[string]any{
		{"id": "kd-1", "workspaceId": "w1", "title": "故障手册-缓存", "status": "published", "ownerId": "u1", "updatedAt": "2026-07-18T00:00:00Z"},
		{"id": "kd-2", "workspaceId": "w1", "title": "发布检查清单", "status": "review", "ownerId": "u2", "updatedAt": "2026-07-19T00:00:00Z"},
	}
	s.KBList = []map[string]any{
		{"id": "kb-ops", "workspaceId": "w1", "name": "运维知识库", "docCount": 2, "status": "ready"},
	}

	s.Conversations = []map[string]any{
		{"id": "conv-1", "workspaceId": "w1", "title": "缓存延迟排查", "digitalEmployeeId": "de-1", "updatedAt": "2026-07-22T08:00:00Z", "messages": []map[string]any{}},
	}
	s.Messages["conv-1"] = []map[string]any{
		{"id": "msg-1", "role": "user", "content": "缓存命中率下降怎么排查？", "createdAt": "2026-07-22T08:00:00Z"},
		{"id": "msg-2", "role": "assistant", "content": "建议先检查 Redis 慢查询与热点 key。", "createdAt": "2026-07-22T08:00:05Z"},
	}
	s.Sessions = []map[string]any{
		{"id": "sess-1", "workspaceId": "w1", "title": "缓存延迟排查", "conversationId": "conv-1", "updatedAt": "2026-07-22T08:00:00Z", "digitalEmployeeId": "de-1"},
	}
	s.SlashCommands = []map[string]any{
		{"id": "cmd-help", "name": "help", "description": "显示可用指令"},
		{"id": "cmd-task", "name": "task", "description": "从对话创建任务"},
	}

	s.Workflows = []map[string]any{
		{"id": "wf-1", "workspaceId": "w1", "name": "故障自愈", "status": "active", "lifecycleStatus": "published", "version": "1.2.0", "ownerId": "u1", "environment": "production", "updatedAt": "2026-07-19T12:00:00Z", "nodes": []map[string]any{{"id": "n1", "type": "start"}, {"id": "n2", "type": "action"}}, "edges": []map[string]any{}},
	}
	s.WorkflowVersions["wf-1"] = []map[string]any{
		{"id": "wfv-1", "workflowId": "wf-1", "version": "1.2.0", "status": "published", "createdAt": "2026-07-19T12:00:00Z"},
	}
	s.WorkflowGens = []map[string]any{}
	s.WorkflowTpls = []map[string]any{
		{"id": "wft-1", "name": "告警处置模板", "description": "标准告警处置"},
	}
	s.WorkflowSkills = []map[string]any{
		{"id": "wfs-1", "workspaceId": "w1", "workflowId": "wf-1", "name": "故障自愈技能", "status": "published", "version": "1.2.0"},
	}
	s.WorkflowRuns = []map[string]any{
		{"id": "run-1", "workspaceId": "w1", "workflowId": "wf-1", "status": "succeeded", "startedAt": "2026-07-22T07:00:00Z", "finishedAt": "2026-07-22T07:05:00Z"},
	}
	s.Skills = []map[string]any{
		{"id": "sk-1", "workspaceId": "w1", "name": "kubectl 只读", "kind": "skill", "lifecycleStatus": "enabled", "status": "published", "runtime": "gvisor", "version": "0.9.0", "risk": "medium"},
	}
	s.SkillCatalog = []map[string]any{
		{"id": "sc-1", "workspaceId": "w1", "name": "日志检索", "kind": "skill", "version": "1.0.0"},
	}
	s.SkillGovernance = map[string]any{
		"total": 1, "healthy": 1, "paused": 0, "incidents": 0,
	}
	s.MemoryRecords = []map[string]any{
		{"id": "mem-1", "workspaceId": "w1", "layer": "working", "scope": "workspace", "content": "生产 Redis 集群高峰时段易抖动", "status": "active", "confidence": 0.9, "ownerId": "u1", "createdAt": "2026-07-20T00:00:00Z"},
		{"id": "mem-2", "workspaceId": "w1", "layer": "short_term", "scope": "user", "content": "本轮会话关注缓存命中率", "status": "active", "confidence": 0.7, "ownerId": "u2", "createdAt": "2026-07-22T08:00:00Z"},
		{"id": "mem-3", "workspaceId": "w1", "layer": "long_term", "scope": "workspace", "content": "高峰扩容经验", "status": "active", "confidence": 0.95, "ownerId": "u1", "createdAt": "2026-07-10T00:00:00Z"},
	}
	s.MemoryCands = []map[string]any{
		{"id": "mc-1", "workspaceId": "w1", "memoryId": "mem-1", "title": "缓存抖动经验", "status": "pending", "confidence": 0.88},
	}
	s.MemoryPolicies["w1"] = map[string]any{
		"workspaceId": "w1", "shortTermTtlHours": 24, "workingMemoryTtlDays": 30, "dailyRefinementTime": "02:00",
		"shortToWorkingEnabled": true, "workingToLongEnabled": true, "longToKnowledgeEnabled": true,
		"minimumConfidence": 0.85, "longTermWriteApproval": true, "sensitiveDataMasking": true,
		"longTermCapacity": 5000, "usedCapacity": 12,
	}
	s.Channels = []map[string]any{
		{"id": "ch-1", "workspaceId": "w1", "name": "企业微信通知", "kind": "wecom", "enabled": true, "monthlySent": 120, "successRate": 0.99},
	}
	s.ChannelDeploys = []map[string]any{
		{"id": "cd-1", "workspaceId": "w1", "channelId": "ch-1", "kind": "wecom", "status": "active", "name": "生产通知", "endpointMasked": "https://qyapi.****"},
	}
	s.DeliveryPolicies = []map[string]any{
		{"id": "dp-1", "workspaceId": "w1", "name": "生产告警投递", "primaryDeploymentId": "cd-1", "fallbackDeploymentIds": []string{}, "status": "published", "dataClassification": "internal", "validationIssues": []string{}},
	}
	s.ChannelTemplates = []map[string]any{
		{"id": "ct-1", "workspaceId": "w1", "name": "告警通知模板", "kind": "wecom", "desc": "标准告警"},
	}
	s.ChannelBlacklist = []map[string]any{}
	s.ChannelAudit = []map[string]any{
		{"id": "ca-1", "workspaceId": "w1", "time": "2026-07-22T07:00:00Z", "actor": "平台管理员", "action": "发布投递策略", "target": "生产告警投递", "result": "success"},
	}
	s.ChannelDLQ = []map[string]any{}
	s.KnowledgeExtra = map[string]any{
		"packages": []map[string]any{{"id": "pkg-ops", "workspaceId": "w1", "name": "运维知识库", "domain": "运维", "status": "published", "classification": "internal", "currentVersion": map[string]any{"version": "3.1.0"}}},
		"sources": []map[string]any{{"id": "ks-1", "workspaceId": "w1", "name": "Confluence", "kind": "confluence", "schedule": "daily", "status": "ready"}},
		"governance": map[string]any{"workspaceId": "w1", "versionRetention": true, "piiMasking": true},
		"audit": []map[string]any{},
		"processingJobs": []map[string]any{},
		"retrievalProfiles": []map[string]any{{"id": "rp-default", "workspaceId": "w1", "name": "默认检索", "topK": 5}},
		"evaluations": []map[string]any{},
		"graphEntities": []map[string]any{},
		"graphRelations": []map[string]any{},
		"bindings": []map[string]any{},
		"citationTrace": []map[string]any{},
		"eval": map[string]any{"recallAtK": 0.82, "citationAccuracy": 0.9},
		"chunksTop": []map[string]any{},
	}

	s.HomeKPIs = map[string]any{
		"activeTasks": 12, "healthScore": 96, "aiCalls24h": 18420, "tokenUsage": "1.2M", "apiP95": 210, "slaBreaches": 1,
	}
	s.HomeAlerts = []map[string]any{
		{"id": "alert-1", "level": "P1", "text": "缓存命中率低于阈值", "time": "2026-07-22T08:10:00Z", "assignee": "业务构建者", "taskCode": "T-1001", "workspaceId": "w1"},
	}
	s.HomeExtra = map[string]any{
		"recentActivities": []map[string]any{
			{"id": "act-1", "type": "task", "tone": "info", "text": "任务进入复核", "actor": "平台管理员", "resource": "T-1002", "time": "08:00"},
		},
		"teamMembers": []map[string]any{
			{"id": "u1", "name": "平台管理员", "role": "admin", "online": true},
			{"id": "u2", "name": "业务构建者", "role": "user", "online": true},
		},
		"slaAlerts": s.HomeAlerts,
		"operationalMetrics": map[string]any{
			"taskSuccessRate": 0.96, "activeAgents": 6, "healthScore": 96, "apiP95": 210, "taskRate": 42,
			"tokenUsage": map[string]any{"total": "1.2M", "input": "800K", "output": "400K"},
			"trend24h": []map[string]any{},
		},
		"costMonth": map[string]any{"used": 1240, "budget": 3000, "daily": []int{100, 120, 140, 160, 180, 200, 220}},
		"quickLinks": []map[string]any{
			{"label": "数字员工", "to": "/agents", "icon": "bot"},
			{"label": "协作", "to": "/copilot", "icon": "message"},
		},
	}
	s.Billing = map[string]any{
		"workspaceId": "w1", "plan": "enterprise_plus", "period": "2026-07",
		"usage": map[string]any{"tokens": 1240000, "usd": 1240},
		"quota": map[string]any{"tokens": 5000000, "usd": 3000},
		"invoices": []map[string]any{{"id": "inv-1", "amount": 1240, "status": "open", "dueAt": "2026-08-05"}},
	}
	s.Backups = []map[string]any{
		{"id": "bk-1", "workspaceId": "w1", "status": "pending_approval", "requestedBy": "平台管理员", "requestedAt": "2026-07-22T06:00:00Z", "scope": "full"},
	}
	s.OpsOverview = map[string]any{
		"services": []map[string]any{
			{"name": "de-core", "status": "up"},
			{"name": "agent-runtime", "status": "up"},
			{"name": "rag", "status": "up"},
		},
		"incidentsOpen": 1, "mttrMinutes": 18,
		"pending": []map[string]any{{"id": "p1", "title": "待确认告警", "level": "P1"}},
		"health": map[string]any{"activeAgents": 6, "score": 96},
	}
	s.NotificationChannels = []map[string]any{
		{"id": "nc-1", "name": "邮件值班", "kind": "email", "enabled": true},
	}
	s.APIKeys = []map[string]any{
		{"id": "key-1", "name": "控制台集成", "masked": "de_****abcd", "createdAt": "2026-07-01T00:00:00Z"},
	}
	s.WebhooksConfig = []map[string]any{
		{"id": "wh-1", "url": "https://example.com/hooks/de", "events": []string{"task.completed"}, "enabled": true},
	}
}
