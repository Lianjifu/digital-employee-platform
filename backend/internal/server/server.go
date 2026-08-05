package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	"github.com/digital-employee-platform/backend/internal/deworkflow"
	"github.com/digital-employee-platform/backend/internal/infra"
	"github.com/digital-employee-platform/backend/internal/modelprov"
	"github.com/digital-employee-platform/backend/internal/policy"
	"github.com/digital-employee-platform/backend/internal/store"
	"github.com/digital-employee-platform/backend/internal/vault"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
	"github.com/digital-employee-platform/backend/pkg/response"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	Store      *store.Store
	Mode       ServiceMode
	RuntimeURL string
	RAGURL     string
	PG         *pgxpool.Pool
	Cache      *infra.Cache
	AuditSink  *infra.AuditSink
	UsageSink  *infra.UsageSink
	KV         *infra.KVStore
	Search     *infra.OpenSearchAudit
	Policy     *policy.Engine
	Vault      *vault.Client
	OIDC       auth.OIDCConfig
	Workflows  *deworkflow.Engine
	ModelProbe *modelprov.Client
	// Optional HTTP clients override Open API transport in tests.
	FeishuHTTP   *http.Client
	DingTalkHTTP *http.Client
	WecomHTTP    *http.Client
	WeixinHTTP   *http.Client
}

func New(st *store.Store) *Server {
	return &Server{
		Store:      st,
		Mode:       ModeAll,
		RuntimeURL: envOr("DE_AGENT_RUNTIME_URL", "http://127.0.0.1:8091"),
		RAGURL:     envOr("DE_RAG_URL", "http://127.0.0.1:8092"),
		Policy:     policy.New(),
		Vault:      vault.NewFromEnv(),
		OIDC:       auth.LoadOIDC(),
		Workflows:  deworkflow.New(),
		ModelProbe: modelprov.NewClient(),
	}
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(lookupEnv(k)); v != "" {
		return v
	}
	return def
}

func (s *Server) Handler() http.Handler {
	mode := s.Mode
	if mode == "" {
		mode = ModeAll
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		response.OK(w, map[string]any{"status": "ok", "service": mode.String(), "mode": string(mode)})
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, r *http.Request) {
		status := map[string]any{
			"status":   "ready",
			"service":  mode.String(),
			"mode":     string(mode),
			"postgres": s.PG != nil,
			"redis":    s.Cache != nil && s.Cache.Available(),
		}
		if s.PG != nil {
			if err := s.PG.Ping(r.Context()); err != nil {
				status["status"] = "degraded"
				status["postgresError"] = err.Error()
			}
		}
		if s.Cache != nil && s.Cache.Available() {
			if err := s.Cache.Ping(r.Context()); err != nil {
				status["status"] = "degraded"
				status["redisError"] = err.Error()
			}
		}
		response.OK(w, status)
	})
	if mode == ModeAll || mode == ModeSys || mode == ModeCollab || mode == ModeCap {
		s.mountConnectRPCForMode(mux, mode)
		mux.HandleFunc("/connect/", s.handleConnect)
	}
	if mode == ModeAll || mode == ModeSys {
		// Local policy evaluate (absorbs former de-policy :8094)
		mux.HandleFunc("/v1/evaluate", s.handleLocalPolicyEvaluate)
	}
	mux.HandleFunc("/metrics", s.metricsPrometheus)
	mux.HandleFunc("/", s.route)
	return cors(s.withHTTPMetrics(s.requireAuth(mux)))
}

func (s *Server) route(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	method := r.Method
	mode := s.Mode
	if mode == "" {
		mode = ModeAll
	}
	if !mode.OwnsPath(path) {
		writeErr(w, apperr.NotFoundErr(apperr.NotFound, fmt.Sprintf("route owned by other unit: %s %s (this=%s)", method, path, mode.String())))
		return
	}
	var (
		data any
		err  error
	)
	switch {
	case path == "/api/auth/login" && method == http.MethodPost:
		data, err = s.login(r)
	case path == "/api/auth/oidc/login" && method == http.MethodGet:
		data, err = s.oidcLogin(r)
	case path == "/api/auth/oidc/callback" && method == http.MethodGet:
		data, err = s.oidcCallback(r)
	case path == "/api/workspaces" && method == http.MethodGet:
		data, err = s.listWorkspaces(r)
	case path == "/api/workspaces" && method == http.MethodPost:
		data, err = s.createWorkspace(r)
	case path == "/api/workspace-switch-history" && method == http.MethodGet:
		data, err = s.switchHistory(r)
	case strings.HasPrefix(path, "/api/workspaces/") && method == http.MethodGet:
		data, err = s.workspaceSubresource(r)
	case strings.HasPrefix(path, "/api/workspaces/") && method == http.MethodPost:
		data, err = s.workspaceAction(r)
	case path == "/api/access/governance" && method == http.MethodGet:
		data, err = s.accessGovernance(r)
	case path == "/api/access/grants" && method == http.MethodPost:
		data, err = s.createGrant(r)
	case strings.HasPrefix(path, "/api/access/grants/") && method == http.MethodPost:
		data, err = s.grantAction(r)
	case path == "/api/access/reviews/complete" && method == http.MethodPost:
		data, err = s.completeReview(r)
	case path == "/api/zero-trust/overview" && method == http.MethodGet:
		data, err = s.ztOverview(r)
	case path == "/api/zero-trust/policies" && method == http.MethodGet:
		data, err = s.ztPolicies(r)
	case path == "/api/zero-trust/policies" && method == http.MethodPost:
		data, err = s.createZTPolicy(r)
	case strings.HasPrefix(path, "/api/zero-trust/policies/") && method == http.MethodPatch:
		data, err = s.patchZTPolicy(r)
	case path == "/api/zero-trust/evaluate" && method == http.MethodPost:
		data, err = s.ztEvaluate(r)
	case path == "/api/zero-trust/events" && method == http.MethodGet:
		data, err = s.ztEvents(r)
	case path == "/api/zero-trust/authorizations" && method == http.MethodGet:
		data, err = s.listTempAuth(r)
	case path == "/api/zero-trust/authorizations" && method == http.MethodPost:
		data, err = s.createTempAuth(r)
	case strings.HasPrefix(path, "/api/zero-trust/authorizations/") && strings.HasSuffix(path, "/revoke") && method == http.MethodPost:
		data, err = s.revokeTempAuth(r)
	case path == "/api/release-approvals" && method == http.MethodGet:
		data, err = s.listReleases(r)
	case path == "/api/release-approvals" && method == http.MethodPost:
		data, err = s.createRelease(r)
	case strings.HasPrefix(path, "/api/release-approvals/") && method == http.MethodPost:
		data, err = s.releaseAction(r)
	case path == "/api/audit-center" && method == http.MethodGet:
		data, err = s.auditCenter(r)
	case path == "/api/audit-center/export" && method == http.MethodPost:
		data, err = s.auditExport(r)

	// Phase B — Mock-aligned digital employees / tasks
	case path == "/api/digital-employees" && method == http.MethodGet:
		data, err = s.listEmployees(r)
	case path == "/api/digital-employees" && method == http.MethodPost:
		data, err = s.createEmployee(r)
	case path == "/api/digital-employees/overview" && method == http.MethodGet:
		data, err = s.employeeOverview(r)
	case path == "/api/digital-employee-templates" && method == http.MethodGet:
		data, err = s.listEmployeeTemplates(r)
	case path == "/api/digital-employee-templates" && method == http.MethodPost:
		data, err = s.listEmployeeTemplates(r) // create uses same list seed shape via adopt flow primarily
	case path == "/api/digital-employee-template-adoptions" && method == http.MethodGet:
		data, err = s.listTemplateAdoptions(r)
	case path == "/api/digital-employee-capability-catalog" && method == http.MethodGet:
		data, err = s.capabilityCatalog(r)
	case strings.HasPrefix(path, "/api/digital-employee-templates/") && strings.HasSuffix(path, "/adopt") && method == http.MethodPost:
		data, err = s.adoptTemplate(r)
	case strings.HasPrefix(path, "/api/digital-employee-templates/") && method == http.MethodPatch:
		data, err = s.listEmployeeTemplates(r)
	case strings.HasPrefix(path, "/api/digital-employees/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch):
		data, err = s.digitalEmployeeRoute(r)
	case path == "/api/tasks" && method == http.MethodGet:
		data, err = s.listTasksAligned(r)
	case path == "/api/tasks" && method == http.MethodPost:
		data, err = s.createTaskAligned(r)
	case strings.HasPrefix(path, "/api/tasks/") && (method == http.MethodGet || method == http.MethodPost):
		data, err = s.taskRoute(r)
	case path == "/api/agents" && method == http.MethodGet:
		data, err = s.legacyAgentsProxy(r)

	// Models — Mock paths
	case path == "/api/model-providers" && method == http.MethodGet:
		data, err = s.listModelProvidersFE(r)
	case path == "/api/model-providers" && method == http.MethodPost:
		data, err = s.createModelProviderFE(r)
	case path == "/api/model-providers/discover-models" && method == http.MethodPost:
		data, err = s.discoverModels(r)
	case path == "/api/model-providers/test-connection" && method == http.MethodPost:
		data, err = s.testModelConnection(r)
	case strings.HasPrefix(path, "/api/model-providers/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch || method == http.MethodDelete):
		data, err = s.modelProviderAction(r)
	case path == "/api/model-routing/policies" && method == http.MethodGet:
		data, err = s.listRoutingPolicies(r)
	case path == "/api/model-routing/policies" && method == http.MethodPost:
		data, err = s.createRoutingPolicy(r)
	case strings.HasPrefix(path, "/api/model-routing/policies/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch):
		data, err = s.routingPolicyAction(r)
	case path == "/api/model-routing/failover-tests" && method == http.MethodPost:
		data, err = s.failoverTest(r)
	case path == "/api/model-governance/overview" && method == http.MethodGet:
		data, err = s.modelGovernanceOverview(r)
	case path == "/api/model-audit" && method == http.MethodGet:
		data, err = s.listModelAudit(r)
	case path == "/api/model-invoke" && method == http.MethodPost:
		data, err = s.modelInvoke(r)
	case path == "/api/model-invoke/stream" && method == http.MethodPost:
		s.modelInvokeStream(w, r)
		return
	case path == "/api/models/providers" && method == http.MethodGet:
		data, err = s.listModelProvidersFE(r)
	case path == "/api/models/providers" && method == http.MethodPost:
		data, err = s.createModelProviderFE(r)
	case path == "/api/models/routes" && method == http.MethodGet:
		data, err = s.listRoutingPolicies(r)
	case path == "/api/models/routes" && method == http.MethodPost:
		data, err = s.createModelRoute(r)
	case path == "/api/models/budgets" && method == http.MethodGet:
		data, err = s.listModelBudgets(r)
	case path == "/api/models/usage" && method == http.MethodGet:
		data, err = s.listUsage(r)

	// Knowledge
	case path == "/api/knowledge/docs" && method == http.MethodGet:
		data, err = s.listKnowledgeDocsAuth(r)
	case path == "/api/knowledge/docs" && method == http.MethodPost:
		data, err = s.createKnowledgeDocAuth(r)
	case path == "/api/knowledge/docs/delete" && method == http.MethodPost:
		data, err = s.deleteKnowledgeDocsAuth(r)
	case path == "/api/knowledge/kb-list" && method == http.MethodGet:
		data, err = s.listKBAuth(r)
	case path == "/api/knowledge/retrieve" && method == http.MethodPost:
		data, err = s.knowledgeRetrieveAuth(r)
	case strings.HasPrefix(path, "/api/knowledge/doc/") && method == http.MethodGet:
		data, err = s.knowledgeDocDetailAuth(r)
	case strings.HasPrefix(path, "/api/knowledge/doc/") && method == http.MethodDelete:
		data, err = s.deleteKnowledgeDocAuth(r)
	case path == "/api/knowledge/packages" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "packages")
	case path == "/api/knowledge/packages" && method == http.MethodPost:
		data, err = s.createKnowledgePackage(r)
	case strings.HasPrefix(path, "/api/knowledge/packages/") && method == http.MethodPost:
		data, err = s.knowledgePackageAction(r)
	case path == "/api/knowledge/sources" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "sources")
	case path == "/api/knowledge/sources" && method == http.MethodPost:
		data, err = s.createKnowledgeSource(r)
	case strings.HasPrefix(path, "/api/knowledge/sources/") && strings.HasSuffix(path, "/sync") && method == http.MethodPost:
		data, err = s.syncKnowledgeSource(r)
	case path == "/api/knowledge/governance" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "governance")
	case path == "/api/knowledge/governance" && method == http.MethodPatch:
		data, err = s.patchKnowledgeGovernanceAuth(r)
	case path == "/api/knowledge/audit" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "audit")
	case path == "/api/knowledge/processing-jobs" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "processingJobs")
	case strings.HasPrefix(path, "/api/knowledge/processing-jobs/") && strings.HasSuffix(path, "/retry") && method == http.MethodPost:
		data, err = s.retryKnowledgeJob(r)
	case path == "/api/knowledge/retrieval-profiles" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "retrievalProfiles")
	case path == "/api/knowledge/evaluations" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "evaluations")
	case path == "/api/knowledge/graph/entities" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "graphEntities")
	case path == "/api/knowledge/graph/relations" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "graphRelations")
	case path == "/api/knowledge/bindings" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "bindings")
	case path == "/api/knowledge/citation-trace" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "citationTrace")
	case path == "/api/knowledge/eval" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "eval")
	case path == "/api/knowledge/chunks/top" && method == http.MethodGet:
		data, err = s.knowledgeExtraFiltered(r, "chunksTop")
	case path == "/api/knowledge/docs/review" && method == http.MethodPost:
		data, err = s.reviewKnowledgeDocs(r)
	case path == "/api/knowledge/reindex" && method == http.MethodPost:
		data, err = s.reindexKnowledgeAuth(r)
	case path == "/api/knowledge/chunks/rescore" && method == http.MethodPost:
		data, err = s.rescoreKnowledgeChunks(r)
	case path == "/api/knowledge/evaluations/run" && method == http.MethodPost:
		data, err = s.runKnowledgeEvaluation(r)

	// Copilot — sessions / conversations / actions
	case path == "/api/sessions" && method == http.MethodGet:
		data, err = s.listSessions(r)
	case path == "/api/sessions" && method == http.MethodPost:
		data, err = s.createSession(r)
	case strings.HasPrefix(path, "/api/sessions/") && strings.HasSuffix(path, "/share") && method == http.MethodPost:
		data, err = s.createSessionShare(r)
	case strings.HasPrefix(path, "/api/sessions/") && strings.HasSuffix(path, "/share") && method == http.MethodDelete:
		data, err = s.revokeSessionShare(r)
	case strings.HasPrefix(path, "/api/sessions/") && method == http.MethodPatch:
		data, err = s.patchSession(r)
	case strings.HasPrefix(path, "/api/sessions/") && method == http.MethodDelete:
		data, err = s.deleteSession(r)
	case strings.HasPrefix(path, "/api/conversations/") && method == http.MethodDelete && !strings.Contains(path, "/stream") && !strings.Contains(path, "/messages") && !strings.Contains(path, "/tasks") && !strings.Contains(path, "/attachments"):
		data, err = s.deleteConversation(r)
	case path == "/api/slash-commands" && method == http.MethodGet:
		data, err = s.listSlashCommands(r)
	case path == "/api/conversations" && method == http.MethodGet:
		data, err = s.listConversations(r)
	case path == "/api/conversations" && method == http.MethodPost:
		data, err = s.createConversation(r)
	case strings.HasPrefix(path, "/api/conversations/") && strings.HasSuffix(path, "/stream") && method == http.MethodPost:
		s.conversationStream(w, r)
		return
	case strings.HasPrefix(path, "/api/conversations/") && strings.HasSuffix(path, "/tasks") && method == http.MethodPost:
		data, err = s.conversationCreateTask(r)
	case strings.HasPrefix(path, "/api/conversations/") && strings.HasSuffix(path, "/attachments") && method == http.MethodPost:
		data, err = s.uploadConversationAttachment(r)
	case strings.HasPrefix(path, "/api/conversations/") && strings.HasSuffix(path, "/messages") && method == http.MethodGet:
		data, err = s.listMessages(r)
	case strings.HasPrefix(path, "/api/conversations/") && method == http.MethodGet:
		data, err = s.getConversation(r)
	case path == "/api/copilot/conversations" && method == http.MethodGet:
		data, err = s.listConversations(r)
	case path == "/api/copilot/conversations" && method == http.MethodPost:
		data, err = s.createConversation(r)
	case strings.HasPrefix(path, "/api/copilot/conversations/") && strings.HasSuffix(path, "/cancel") && method == http.MethodPost:
		data, err = s.cancelCopilotTurn(r)
	case strings.HasPrefix(path, "/api/copilot/conversations/") && strings.HasSuffix(path, "/stream") && method == http.MethodPost:
		s.copilotStream(w, r)
		return
	case strings.HasPrefix(path, "/api/copilot/conversations/") && strings.Contains(path, "/messages/") && strings.HasSuffix(path, "/feedback") && method == http.MethodPost:
		data, err = s.copilotMessageFeedback(r)
	case strings.HasPrefix(path, "/api/actions/") && strings.HasSuffix(path, "/approve") && method == http.MethodPost:
		data, err = s.approveAction(r)
	case strings.HasPrefix(path, "/api/actions/") && strings.HasSuffix(path, "/reject") && method == http.MethodPost:
		data, err = s.rejectAction(r)
	case strings.HasPrefix(path, "/api/actions/") && strings.HasSuffix(path, "/execute") && method == http.MethodPost:
		data, err = s.executeAction(r)
	case strings.HasPrefix(path, "/api/share/") && method == http.MethodGet:
		data, err = s.getSharedSession(r)
	case strings.HasPrefix(path, "/api/attachments/") && method == http.MethodGet:
		s.downloadAttachment(w, r)
		return

	// Workflows
	case path == "/api/workflows" && method == http.MethodGet:
		data, err = s.listWorkflows(r)
	case path == "/api/workflows" && method == http.MethodPost:
		data, err = s.createWorkflow(r)
	case path == "/api/workflow-templates" && method == http.MethodGet:
		data, err = s.listWorkflowTemplates(r)
	case path == "/api/workflows/generations" && method == http.MethodGet:
		data, err = s.listWorkflowGenerations(r)
	case path == "/api/workflows/generate" && method == http.MethodPost:
		data, err = s.generateWorkflow(r)
	case path == "/api/workflow-skills" && method == http.MethodGet:
		data, err = s.listWorkflowSkillsAligned(r)
	case strings.HasPrefix(path, "/api/workflow-skills/") && strings.HasSuffix(path, "/publish") && method == http.MethodPost:
		data, err = s.publishWorkflowSkill(r)
	case path == "/api/workflow-runs" && method == http.MethodGet:
		data, err = s.listWorkflowRuns(r)
	case path == "/api/workflows/run" && method == http.MethodPost:
		data, err = s.runWorkflow(r)
	case strings.HasPrefix(path, "/api/workflows/") && strings.HasSuffix(path, "/capabilities") && method == http.MethodPost:
		data, err = s.bindWorkflowCapability(r)
	case strings.HasPrefix(path, "/api/workflows/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch):
		data, err = s.workflowByID(r)

	// Skills
	case path == "/api/skills" && method == http.MethodGet:
		data, err = s.listSkillsAligned(r)
	case path == "/api/skills" && method == http.MethodPost:
		data, err = s.createSkill(r)
	case path == "/api/skills/import" && method == http.MethodPost:
		data, err = s.importSkills(r)
	case path == "/api/skills/import-package" && method == http.MethodPost:
		data, err = s.importSkillPackage(r)
	case path == "/api/skills/catalog" && method == http.MethodGet:
		data, err = s.listSkillCatalog(r)
	case path == "/api/skills/catalog/publish" && method == http.MethodPost:
		data, err = s.publishSkillToCatalog(r)
	case path == "/api/skills/catalog/sync" && method == http.MethodPost:
		data, err = s.syncSkillCatalog(r)
	case path == "/api/skills/governance/overview" && method == http.MethodGet:
		data, err = s.skillsGovernanceOverview(r)
	case path == "/api/skills/governance/health" && method == http.MethodGet:
		data, err = s.skillsGovernanceHealth(r)
	case path == "/api/skills/governance/incidents" && method == http.MethodGet:
		data, err = s.skillsGovernanceIncidents(r)
	case path == "/api/skills/governance/events" && method == http.MethodGet:
		data, err = s.skillsGovernanceEvents(r)
	case path == "/api/skills/governance/trends" && method == http.MethodGet:
		data, err = s.skillsGovernanceTrends(r)
	case path == "/api/skills/governance/batch" && method == http.MethodPost:
		data, err = s.skillsGovernanceBatch(r)
	case path == "/api/skills/audit" && method == http.MethodGet:
		data, err = s.listSkillAudit(r)
	case path == "/api/skills/execute" && method == http.MethodPost:
		data, err = s.executeSkill(r)
	case strings.HasPrefix(path, "/api/skill-artifacts/") && (method == http.MethodGet || method == http.MethodHead):
		s.serveSkillArtifact(w, r)
		return
	case strings.HasPrefix(path, "/api/skills/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch):
		data, err = s.skillByID(r)
	case path == "/api/skill-integrations" && method == http.MethodGet:
		data, err = s.listSkillIntegrations(r)
	case strings.HasPrefix(path, "/api/skill-integrations/") && (method == http.MethodPost || method == http.MethodPatch):
		data, err = s.skillIntegrationAction(r)
	case path == "/api/mcp-connections" && method == http.MethodPost:
		data, err = s.createMCPConnection(r)
	case path == "/api/tools" && method == http.MethodPost:
		data, err = s.createTool(r)
	case strings.HasPrefix(path, "/api/agents/") && strings.HasSuffix(path, "/skills") && method == http.MethodPost:
		data, err = s.bindAgentSkill(r)

	// Memory
	case path == "/api/memory/overview" && method == http.MethodGet:
		data, err = s.memoryOverviewAligned(r)
	case path == "/api/memory/records" && method == http.MethodGet:
		data, err = s.listMemory(r)
	case path == "/api/memory/records" && method == http.MethodPost:
		data, err = s.createMemory(r)
	case strings.HasPrefix(path, "/api/memory/records/") && (method == http.MethodPost || method == http.MethodDelete):
		data, err = s.memoryRecordAction(r)
	case path == "/api/memory/candidates" && method == http.MethodGet:
		data, err = s.listMemoryCandidates(r)
	case strings.HasPrefix(path, "/api/memory/candidates/") && method == http.MethodPost:
		data, err = s.memoryCandidateActionAligned(r)
	case path == "/api/memory/refinement/run" && method == http.MethodPost:
		data, err = s.memoryRefinement(r)
	case path == "/api/memory/policy" && method == http.MethodGet:
		data, err = s.getMemoryPolicy(r)
	case path == "/api/memory/policy" && method == http.MethodPatch:
		data, err = s.patchMemoryPolicy(r)
	case path == "/api/memory/audit" && method == http.MethodGet:
		data, err = s.listMemoryAudits(r)

	// Self-Evolution (Phase 4)
	case path == "/api/evolve/candidates" && method == http.MethodGet:
		data, err = s.listEvolveCandidates(r)
	case strings.HasPrefix(path, "/api/evolve/candidates/") && method == http.MethodPost:
		data, err = s.evolveCandidateAction(r)
	case path == "/api/evolve/dream/run" && method == http.MethodPost:
		data, err = s.evolveDreamRun(r)

	// Channels — Mock channel-control
	case path == "/api/channel-control/deployments" && method == http.MethodGet:
		data, err = s.channelControlDeployments(r)
	case path == "/api/channel-control/deployments" && method == http.MethodPost:
		data, err = s.channelControlCreateDeploy(r)
	case strings.HasPrefix(path, "/api/channel-control/deployments/") && (method == http.MethodGet || method == http.MethodPost || method == http.MethodPatch || method == http.MethodDelete):
		data, err = s.channelDeployAction(r)
	case path == "/api/channel-control/policies" && method == http.MethodGet:
		data, err = s.channelControlPolicies(r)
	case strings.HasPrefix(path, "/api/channel-control/policies/") && (method == http.MethodGet || method == http.MethodPost):
		data, err = s.channelControlPolicyAction(r)
	case path == "/api/channel-control/overview" && method == http.MethodGet:
		data, err = s.channelControlOverview(r)
	case path == "/api/channel-control/dead-letters" && method == http.MethodGet:
		data, err = s.channelControlDeadLetters(r)
	case strings.HasPrefix(path, "/api/channel-control/dead-letters/") && strings.HasSuffix(path, "/replay") && method == http.MethodPost:
		data, err = s.replayChannelDLQ(r)
	case strings.HasPrefix(path, "/api/channels/dlq/") && strings.HasSuffix(path, "/replay") && method == http.MethodPost:
		data, err = s.replayChannelDLQ(r)
	case path == "/api/channel-control/audit" && method == http.MethodGet:
		data, err = s.channelControlAudit(r)
	case path == "/api/channel-control/health" && method == http.MethodGet:
		data, err = s.channelControlHealth(r)
	case path == "/api/channel-control/deliveries" && method == http.MethodPost:
		data, err = s.channelControlDeliveries(r)
	case path == "/api/channel-control/inbound" && method == http.MethodGet:
		data, err = s.channelControlInbound(r)
	case strings.HasPrefix(path, "/api/channel/feishu/events/") && method == http.MethodPost:
		s.handleFeishuWebhook(w, r)
		return
	case strings.HasPrefix(path, "/api/channel/wecom/events/") && (method == http.MethodGet || method == http.MethodPost):
		s.handleWecomWebhook(w, r)
		return
	case strings.HasPrefix(path, "/api/channel/dingtalk/events/") && method == http.MethodPost:
		s.handleDingtalkWebhook(w, r)
		return
	case path == "/api/channel-templates" && method == http.MethodGet:
		data, err = s.listChannelTemplates(r)
	case path == "/api/channel-templates" && method == http.MethodPost:
		data, err = s.createChannelTemplate(r)
	case path == "/api/channel-blacklist" && method == http.MethodGet:
		data, err = s.listChannelBlacklist(r)
	case path == "/api/channel-blacklist" && method == http.MethodPost:
		data, err = s.createChannelBlacklist(r)
	case path == "/api/channels" && method == http.MethodGet:
		data, err = s.listChannels(r)
	case path == "/api/channels" && method == http.MethodPost:
		data, err = s.createChannel(r)
	case path == "/api/channels/deployments" && method == http.MethodGet:
		data, err = s.channelControlDeployments(r)
	case path == "/api/channels/outbound" && method == http.MethodPost:
		data, err = s.channelOutbound(r)
	case path == "/api/channels/dlq" && method == http.MethodGet:
		data, err = s.listChannelDLQ(r)

	// Home / ops / settings
	case path == "/api/home/kpis" && method == http.MethodGet:
		data, err = s.homeKPIs(r)
	case path == "/api/home/extra" && method == http.MethodGet:
		data, err = s.homeExtra(r)
	case path == "/api/home/events" && method == http.MethodGet:
		data, err = s.homeEvents(r)
	case path == "/api/home/team" && method == http.MethodGet:
		data, err = s.homeTeam(r)
	case path == "/api/home/alerts" && method == http.MethodGet:
		data, err = s.homeAlerts(r)
	case strings.HasPrefix(path, "/api/home/alerts/") && (strings.HasSuffix(path, "/acknowledge") || strings.HasSuffix(path, "/ack")) && method == http.MethodPost:
		data, err = s.ackAlertPath(r)
	case path == "/api/operations/overview" && method == http.MethodGet:
		data, err = s.opsOverview(r)
	case path == "/api/billing" && method == http.MethodGet:
		data, err = s.getBilling(r)
	case path == "/api/billing/quota" && method == http.MethodGet:
		data, err = s.getBillingQuota(r)
	case path == "/api/backups" && method == http.MethodGet:
		data, err = s.listBackups(r)
	case path == "/api/backups" && method == http.MethodPost:
		data, err = s.requestBackup(r)
	case strings.HasPrefix(path, "/api/backups/") && method == http.MethodPost:
		data, err = s.backupAction(r)
	case path == "/api/notification-channels" && method == http.MethodGet:
		data, err = s.listNotificationChannels(r)
	case strings.HasPrefix(path, "/api/notification-channels/") && method == http.MethodPatch:
		data, err = s.patchNotificationChannel(r)
	case path == "/api/tenant/profile" && method == http.MethodGet:
		data, err = s.getTenantProfile(r)
	case path == "/api/tenant/profile" && method == http.MethodPatch:
		data, err = s.patchTenantProfile(r)
	case path == "/api/api-keys" && method == http.MethodGet:
		data, err = s.listAPIKeys(r)
	case path == "/api/webhooks-config" && method == http.MethodGet:
		data, err = s.listWebhooksConfig(r)

	// Aliases absorbed from former de-policy / de-audit proxy surfaces
	case path == "/api/governance" && method == http.MethodGet:
		data, err = s.accessGovernance(r)
	case (path == "/api/audit" || path == "/api/audits") && method == http.MethodGet:
		data, err = s.auditCenter(r)

	default:
		if d, e, ok := s.alias(path, method, r); ok {
			data, err = d, e
		} else {
			err = apperr.NotFoundErr(apperr.NotFound, fmt.Sprintf("no route %s %s", method, path))
		}
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	response.OK(w, data)
}

func writeErr(w http.ResponseWriter, err error) {
	response.Fail(w, err)
}

func (s *Server) alias(path, method string, r *http.Request) (any, error, bool) {
	switch {
	case path == "/api/model/providers" && method == http.MethodGet:
		v, err := s.listModelProviders(r)
		return v, err, true
	case path == "/api/model/routes" && method == http.MethodGet:
		v, err := s.listModelRoutes(r)
		return v, err, true
	case path == "/api/channel/deployments" && method == http.MethodGet:
		v, err := s.listChannelDeploys(r)
		return v, err, true
	case path == "/api/channels/list" && method == http.MethodGet:
		v, err := s.listChannels(r)
		return v, err, true
	}
	return nil, nil, false
}

func (s *Server) login(r *http.Request) (any, error) {
	if forceOIDCLogin() {
		return nil, apperr.Forbidden(apperr.RoleForbidden, "生产环境已禁用密码登录，请使用 OIDC（/api/auth/oidc/login）")
	}
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := response.Decode(r, &body); err != nil || body.Email == "" || body.Password == "" {
		return nil, apperr.BadReq(apperr.CredentialsRequired, "缺少凭据")
	}
	role, name, userID := auth.RoleFromEmail(body.Email)
	ws := []string{"w1", "w2"}
	scopes := []string{"sandbox", "staging"}
	if role == "admin" {
		ws = []string{"w1", "w2", "w3", "w4"}
		scopes = []string{"sandbox", "staging", "production"}
	}
	if role == "auditor" {
		ws = []string{"w1", "w2", "w3"}
		scopes = []string{"sandbox", "staging", "production"}
	}
	id := auth.Identity{
		ID: userID, Name: name, Email: body.Email, Role: role,
		TenantID: "tenant-acme", WorkspaceID: ws[0], WorkspaceIDs: ws,
		EnvironmentScopes: scopes, Permissions: auth.RolePermissions(role), MFAEnabled: true,
	}
	// Prefer stable mock tokens for FE smoke; production (DE_BAN_MOCK_TOKEN) issues JWT only.
	token := "mock-user-token"
	switch role {
	case "admin":
		token = "mock-admin-token"
	case "auditor":
		token = "mock-auditor-token"
	}
	preferJWT := strings.EqualFold(r.Header.Get("x-prefer-jwt"), "1") || banMockTokenEnv()
	if jwt, err := auth.Sign(id, 24*time.Hour); err == nil && preferJWT {
		token = jwt
	}
	s.Store.Lock()
	s.Store.AppendAudit(id.WorkspaceID, id.Name, "登录", "auth", "success", "")
	s.Store.Unlock()
	return map[string]any{"token": token, "user": id}, nil
}

func banMockTokenEnv() bool {
	v := strings.TrimSpace(os.Getenv("DE_BAN_MOCK_TOKEN"))
	return v == "1" || strings.EqualFold(v, "true")
}

// forceOIDCLogin disables password login when DE_FORCE_OIDC=1, or when
// DE_BAN_MOCK_TOKEN=1 unless DE_ALLOW_PASSWORD_LOGIN=1 (local escape hatch).
func forceOIDCLogin() bool {
	if v := strings.TrimSpace(os.Getenv("DE_FORCE_OIDC")); v == "1" || strings.EqualFold(v, "true") {
		return true
	}
	if !banMockTokenEnv() {
		return false
	}
	allow := strings.TrimSpace(os.Getenv("DE_ALLOW_PASSWORD_LOGIN"))
	return !(allow == "1" || strings.EqualFold(allow, "true"))
}

func decodeMap(r *http.Request) (map[string]any, error) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		return map[string]any{}, nil
	}
	return body, nil
}

func str(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func contains(ss []string, x string) bool {
	for _, s := range ss {
		if s == x {
			return true
		}
	}
	return false
}
