package server

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/digital-employee-platform/backend/internal/auth"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

type ctxKey string

const (
	identityKey  ctxKey = "identity"
	workspaceKey ctxKey = "workspaceCtx"
)

// WorkspaceCtx is the resolved tenant/workspace scope for the request.
// Workspace is derived from identity membership; x-workspace-id may select
// among allowed workspaces but cannot forge access.
type WorkspaceCtx struct {
	TenantID    string
	WorkspaceID string
	ActorID     string
	Role        string
}

func withIdentity(ctx context.Context, id *auth.Identity) context.Context {
	return context.WithValue(ctx, identityKey, id)
}

func identityFrom(ctx context.Context) *auth.Identity {
	v, _ := ctx.Value(identityKey).(*auth.Identity)
	return v
}

func withWorkspace(ctx context.Context, ws *WorkspaceCtx) context.Context {
	return context.WithValue(ctx, workspaceKey, ws)
}

func workspaceFrom(ctx context.Context) *WorkspaceCtx {
	v, _ := ctx.Value(workspaceKey).(*WorkspaceCtx)
	return v
}

func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" || r.URL.Path == "/metrics" ||
			r.URL.Path == "/v1/evaluate" ||
			r.URL.Path == "/api/auth/login" ||
			r.URL.Path == "/api/auth/oidc/login" || r.URL.Path == "/api/auth/oidc/callback" ||
			strings.HasPrefix(r.URL.Path, "/api/channel/feishu/events/") ||
			strings.HasPrefix(r.URL.Path, "/api/channel/wecom/events/") ||
			strings.HasPrefix(r.URL.Path, "/api/channel/dingtalk/events/") {
			next.ServeHTTP(w, r)
			return
		}
		h := r.Header.Get("Authorization")
		if h == "" {
			writeErr(w, apperr.UnauthorizedErr("缺少认证凭证"))
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer"))
		token = strings.TrimSpace(strings.TrimPrefix(token, "bearer"))

		if banMockToken() && strings.HasPrefix(token, "mock-") {
			writeErr(w, apperr.UnauthorizedErr("生产环境禁止使用 mock token"))
			return
		}

		id, err := auth.Parse(token)
		if err != nil {
			writeErr(w, apperr.UnauthorizedErr("无效令牌"))
			return
		}
		// Merge workspaces created after login (mock tokens have fixed membership).
		if s.Store != nil && id != nil {
			s.Store.RLock()
			extra := append([]string{}, s.Store.ActorExtraWorkspaces[id.ID]...)
			s.Store.RUnlock()
			for _, ws := range extra {
				if !contains(id.WorkspaceIDs, ws) {
					id.WorkspaceIDs = append(id.WorkspaceIDs, ws)
				}
			}
		}
		if id.Role == "auditor" && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			p := r.URL.Path
			// Self-Evolution 会签：审计员可对 skill/routing 候选 approve|reject
			evolveOK := strings.HasPrefix(p, "/api/evolve/candidates/") &&
				(strings.HasSuffix(p, "/approve") || strings.HasSuffix(p, "/reject"))
			if !evolveOK {
				writeErr(w, apperr.Forbidden(apperr.AuditorReadOnly, "审计用户仅可读取证据，不能修改平台资源"))
				return
			}
		}
		if id.Role == "user" {
			p := r.URL.Path
			if r.Method != http.MethodGet && (strings.HasPrefix(p, "/api/model") || strings.HasPrefix(p, "/api/channel") || strings.HasPrefix(p, "/api/access")) {
				writeErr(w, apperr.Forbidden(apperr.RoleForbidden, "普通用户无权管理平台能力或访问治理"))
				return
			}
		}

		wsCtx, err := resolveWorkspaceCtx(id, r.Header.Get("x-workspace-id"))
		if err != nil {
			writeErr(w, err)
			return
		}

		ctx := withIdentity(r.Context(), id)
		ctx = withWorkspace(ctx, wsCtx)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func banMockToken() bool {
	v := strings.TrimSpace(os.Getenv("DE_BAN_MOCK_TOKEN"))
	return v == "1" || strings.EqualFold(v, "true")
}

// resolveWorkspaceCtx picks an allowed workspace from membership.
// If header is empty → identity.WorkspaceID (or first membership).
// If header forges a workspace outside membership → 403.
func resolveWorkspaceCtx(id *auth.Identity, headerWS string) (*WorkspaceCtx, error) {
	if id == nil {
		return nil, apperr.UnauthorizedErr("未登录")
	}
	allowed := id.WorkspaceIDs
	if len(allowed) == 0 && id.WorkspaceID != "" {
		allowed = []string{id.WorkspaceID}
	}
	if len(allowed) == 0 {
		return nil, apperr.Forbidden(apperr.WorkspaceScope, "账号未绑定任何工作区")
	}

	ws := strings.TrimSpace(headerWS)
	if ws == "" {
		ws = id.WorkspaceID
	}
	if ws == "" {
		ws = allowed[0]
	}
	ok := false
	for _, a := range allowed {
		if a == ws {
			ok = true
			break
		}
	}
	if !ok {
		return nil, apperr.Forbidden(apperr.WorkspaceScope, "无权访问其他工作区资源")
	}
	return &WorkspaceCtx{
		TenantID:    id.TenantID,
		WorkspaceID: ws,
		ActorID:     id.ID,
		Role:        id.Role,
	}, nil
}

func (s *Server) workspaceID(r *http.Request) string {
	if ws := workspaceFrom(r.Context()); ws != nil && ws.WorkspaceID != "" {
		return ws.WorkspaceID
	}
	if id := identityFrom(r.Context()); id != nil && id.WorkspaceID != "" {
		return id.WorkspaceID
	}
	return "w1"
}

func (s *Server) requireWorkspaceAccess(id *auth.Identity, workspaceID string) error {
	if id == nil {
		return apperr.UnauthorizedErr("未登录")
	}
	for _, w := range id.WorkspaceIDs {
		if w == workspaceID {
			return nil
		}
	}
	if id.WorkspaceID != "" && id.WorkspaceID == workspaceID {
		return nil
	}
	return apperr.Forbidden(apperr.WorkspaceScope, "无权访问其他工作区资源")
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, x-workspace-id, x-tenant-id, x-mock-role, x-mock-actor, x-mock-user-id, x-mock-permissions")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
