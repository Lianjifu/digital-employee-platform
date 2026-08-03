package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/digital-employee-platform/backend/internal/auth"
	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

func (s *Server) requireChannelRead(r *http.Request) (*auth.Identity, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.read") && id.Role != "admin" && id.Role != "auditor" {
		return nil, apperr.Forbidden(apperr.ChannelReadForbidden, "缺少 channel.read")
	}
	return id, nil
}

func (s *Server) requireChannelWrite(r *http.Request) (*auth.Identity, error) {
	id := identityFrom(r.Context())
	if !auth.Has(id, "channel.write") && id.Role != "admin" {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "缺少 channel.write")
	}
	return id, nil
}

func (s *Server) appendChannelAuditLocked(ws, actor, action, target, result, reason, corr string) {
	if corr == "" {
		corr = s.Store.ID("channel_corr")
	}
	s.Store.ChannelAudit = append([]map[string]any{{
		"id": s.Store.ID("ca"), "workspaceId": ws, "time": time.Now().UTC().Format(time.RFC3339),
		"actor": actor, "action": action, "target": target, "result": result,
		"reason": reason, "correlationId": corr,
	}}, s.Store.ChannelAudit...)
}

func (s *Server) persistChannel() {
	s.Store.Persist("channel_deploys")
	s.Store.Persist("channel_dlq")
	s.Store.Persist("delivery_policies")
	s.Store.Persist("delivery_policy_versions")
	s.Store.Persist("channel_templates")
	s.Store.Persist("channel_blacklist")
	s.Store.Persist("channel_audit")
}

func stringSliceAny(v any) []string {
	switch t := v.(type) {
	case []string:
		return append([]string{}, t...)
	case []any:
		out := make([]string, 0, len(t))
		for _, x := range t {
			out = append(out, str(x))
		}
		return out
	default:
		return nil
	}
}

func maskCredential(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "••••••••"
	}
	if len(raw) <= 4 {
		return "••••"
	}
	return "••••" + raw[len(raw)-4:]
}

func (s *Server) findDeployLocked(id, ws string) map[string]any {
	for _, d := range s.Store.ChannelDeploys {
		if str(d["id"]) == id && (ws == "" || str(d["workspaceId"]) == ws) {
			return d
		}
	}
	return nil
}

func (s *Server) validateDeliveryPolicyLocked(policy map[string]any) []string {
	ws := str(policy["workspaceId"])
	primaryID := str(policy["primaryDeploymentId"])
	fallbacks := stringSliceAny(policy["fallbackDeploymentIds"])
	ids := append([]string{primaryID}, fallbacks...)
	issues := []string{}
	seen := map[string]bool{}
	for _, id := range ids {
		if id == "" {
			continue
		}
		if seen[id] {
			issues = append(issues, "E_DELIVERY_FALLBACK_INVALID: 降级链不能重复")
			break
		}
		seen[id] = true
	}
	primary := s.findDeployLocked(primaryID, ws)
	if primary == nil || str(primary["status"]) != "active" {
		issues = append(issues, "E_DELIVERY_PRIMARY_UNAVAILABLE: 主渠道不可用")
	}
	for _, fid := range fallbacks {
		d := s.findDeployLocked(fid, ws)
		if d == nil || str(d["status"]) != "active" {
			issues = append(issues, "E_DELIVERY_FALLBACK_INVALID: 降级渠道不可用或不属于当前工作区")
			break
		}
	}
	if str(policy["dataClassification"]) == "restricted" {
		kinds := []string{}
		if primary != nil {
			kinds = append(kinds, str(primary["kind"]))
		}
		for _, fid := range fallbacks {
			if d := s.findDeployLocked(fid, ws); d != nil {
				kinds = append(kinds, str(d["kind"]))
			}
		}
		for _, kind := range kinds {
			if kind == "webhook" || kind == "sms" {
				issues = append(issues, "E_DELIVERY_CLASSIFICATION_BLOCKED: 受限数据不能投递至外部渠道")
				break
			}
		}
	}
	// dedupe issues
	uniq := []string{}
	seenIssue := map[string]bool{}
	for _, i := range issues {
		if !seenIssue[i] {
			seenIssue[i] = true
			uniq = append(uniq, i)
		}
	}
	return uniq
}

func (s *Server) publishedDeploymentRefsLocked() map[string]bool {
	refs := map[string]bool{}
	for _, v := range s.Store.DeliveryPolicyVersions {
		snap, _ := v["snapshot"].(map[string]any)
		if snap == nil {
			continue
		}
		refs[str(snap["primaryDeploymentId"])] = true
		for _, fid := range stringSliceAny(snap["fallbackDeploymentIds"]) {
			refs[fid] = true
		}
	}
	for _, p := range s.Store.DeliveryPolicies {
		if str(p["status"]) != "published" {
			continue
		}
		refs[str(p["primaryDeploymentId"])] = true
		for _, fid := range stringSliceAny(p["fallbackDeploymentIds"]) {
			refs[fid] = true
		}
	}
	return refs
}

func (s *Server) channelControlDeployments(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, d := range s.Store.ChannelDeploys {
		if str(d["workspaceId"]) == ws {
			out = append(out, d)
		}
	}
	return out, nil
}

func (s *Server) channelControlCreateDeploy(r *http.Request) (any, error) {
	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)
	name := strings.TrimSpace(str(body["name"]))
	kind := strings.TrimSpace(str(body["kind"]))
	cred := strings.TrimSpace(coalesce(str(body["credential"]), str(body["apiKey"])))
	if name == "" || kind == "" || cred == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "E_CHANNEL_DEPLOYMENT_INVALID: 名称、类型和凭据不能为空")
	}
	ws := s.workspaceID(r)
	deployID := s.Store.ID("channel_deployment")
	item := map[string]any{
		"id": deployID, "workspaceId": ws, "name": name, "kind": kind,
		"environment": coalesce(str(body["environment"]), "sandbox"), "status": "draft",
		"credentialRef": "vault://channel-deployments/" + deployID + "/credential",
		"credentialMasked": maskCredential(cred),
		"owner": coalesce(strings.TrimSpace(str(body["owner"])), id.Name),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.ChannelDeploys = append([]map[string]any{item}, s.Store.ChannelDeploys...)
	s.appendChannelAuditLocked(ws, id.Name, "接入渠道部署", name, "success", str(body["reason"]), "")
	go s.persistChannel()
	return item, nil
}

func (s *Server) channelDeployAction(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 4 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "部署不存在")
	}
	did, action := parts[3], ""
	if len(parts) >= 5 {
		action = parts[4]
	}
	ws := s.workspaceID(r)

	if action == "impact" && r.Method == http.MethodGet {
		if _, err := s.requireChannelRead(r); err != nil {
			return nil, err
		}
		s.Store.RLock()
		defer s.Store.RUnlock()
		d := s.findDeployLocked(did, ws)
		if d == nil {
			return nil, apperr.NotFoundErr(apperr.NotFound, "E_CHANNEL_DEPLOYMENT_NOT_FOUND: 渠道部署不存在")
		}
		refs := []string{}
		for _, v := range s.Store.DeliveryPolicyVersions {
			snap, _ := v["snapshot"].(map[string]any)
			if snap == nil {
				continue
			}
			ids := append([]string{str(snap["primaryDeploymentId"])}, stringSliceAny(snap["fallbackDeploymentIds"])...)
			for _, x := range ids {
				if x == did {
					refs = append(refs, str(v["id"]))
					break
				}
			}
		}
		return map[string]any{"deploymentId": did, "deletionAllowed": len(refs) == 0, "references": refs}, nil
	}

	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)
	now := time.Now().UTC().Format(time.RFC3339)

	s.Store.Lock()
	defer s.Store.Unlock()
	for i, d := range s.Store.ChannelDeploys {
		if str(d["id"]) != did {
			continue
		}
		if str(d["workspaceId"]) != ws {
			return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "E_CHANNEL_WORKSPACE_SCOPE: 无权操作其他工作区渠道资源")
		}
		switch {
		case action == "verify" && r.Method == http.MethodPost:
			d["status"] = "active"
			d["lastVerifiedAt"] = now
			s.appendChannelAuditLocked(ws, id.Name, "验证渠道连通性", str(d["name"]), "success", str(body["reason"]), "")
			go s.persistChannel()
			return d, nil
		case action == "disable" && r.Method == http.MethodPost:
			d["status"] = "disabled"
			s.appendChannelAuditLocked(ws, id.Name, "停用渠道部署", str(d["name"]), "success", str(body["reason"]), "")
			go s.persistChannel()
			return d, nil
		case r.Method == http.MethodDelete && action == "":
			refs := s.publishedDeploymentRefsLocked()
			if refs[did] {
				s.appendChannelAuditLocked(ws, id.Name, "删除渠道部署", str(d["name"]), "failed", "渠道被已发布投递策略引用", "")
				return nil, apperr.Conflict(apperr.ChannelInUse, "E_CHANNEL_IN_USE: 渠道被已发布投递策略引用")
			}
			s.Store.ChannelDeploys = append(s.Store.ChannelDeploys[:i], s.Store.ChannelDeploys[i+1:]...)
			s.appendChannelAuditLocked(ws, id.Name, "删除渠道部署", str(d["name"]), "success", str(body["reason"]), "")
			go s.persistChannel()
			return map[string]any{"id": did, "status": "deleted"}, nil
		}
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "E_CHANNEL_DEPLOYMENT_NOT_FOUND: 渠道部署不存在")
}

func (s *Server) channelControlPolicies(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, p := range s.Store.DeliveryPolicies {
		if str(p["workspaceId"]) == ws {
			cp := map[string]any{}
			for k, v := range p {
				cp[k] = v
			}
			cp["fallbackDeploymentIds"] = stringSliceAny(p["fallbackDeploymentIds"])
			if cp["validationIssues"] == nil {
				cp["validationIssues"] = []string{}
			}
			out = append(out, cp)
		}
	}
	return out, nil
}

func (s *Server) channelControlOverview(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	active, published, dlq := 0, 0, 0
	for _, d := range s.Store.ChannelDeploys {
		if str(d["workspaceId"]) == ws && str(d["status"]) == "active" {
			active++
		}
	}
	for _, p := range s.Store.DeliveryPolicies {
		if str(p["workspaceId"]) == ws && str(p["status"]) == "published" {
			published++
		}
	}
	for _, d := range s.Store.ChannelDLQ {
		if str(d["workspaceId"]) == ws && (str(d["status"]) == "dead_letter" || str(d["status"]) == "") {
			dlq++
		}
	}
	risk := "normal"
	if dlq > 0 {
		risk = "attention"
	}
	return map[string]any{"activeDeployments": active, "publishedPolicies": published, "deadLetters": dlq, "capacityRisk": risk}, nil
}

func (s *Server) channelControlDeadLetters(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, d := range s.Store.ChannelDLQ {
		if str(d["workspaceId"]) != ws {
			continue
		}
		if st := str(d["status"]); st != "" && st != "dead_letter" {
			continue
		}
		out = append(out, normalizeDeliveryAttempt(d))
	}
	return out, nil
}

func normalizeDeliveryAttempt(d map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range d {
		out[k] = v
	}
	if str(out["targetMasked"]) == "" {
		out["targetMasked"] = coalesce(str(out["target"]), "***")
	}
	if str(out["payloadSummary"]) == "" {
		out["payloadSummary"] = coalesce(str(out["error"]), "投递失败")
	}
	if str(out["createdAt"]) == "" {
		out["createdAt"] = coalesce(str(out["at"]), time.Now().UTC().Format(time.RFC3339))
	}
	if str(out["deploymentId"]) == "" {
		out["deploymentId"] = coalesce(str(out["channelId"]), "")
	}
	if str(out["correlationId"]) == "" {
		out["correlationId"] = coalesce(str(out["id"]), "")
	}
	if out["attempts"] == nil {
		out["attempts"] = 1
	}
	if str(out["status"]) == "" {
		out["status"] = "dead_letter"
	}
	return out
}

func (s *Server) channelControlAudit(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, a := range s.Store.ChannelAudit {
		if str(a["workspaceId"]) == ws {
			out = append(out, a)
		}
	}
	return out, nil
}

func (s *Server) channelControlHealth(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, d := range s.Store.ChannelDeploys {
		if str(d["workspaceId"]) != ws {
			continue
		}
		id := str(d["id"])
		h := s.Store.ChannelHealth[id]
		if h == nil {
			status := "offline"
			rate, p95 := 0.0, 0
			if str(d["status"]) == "active" {
				status = "healthy"
				rate, p95 = 99.0, 150
			}
			h = map[string]any{"deploymentId": id, "successRate": rate, "p95Ms": p95, "errorCount24h": 0, "status": status}
		}
		row := map[string]any{}
		for k, v := range h {
			row[k] = v
		}
		row["deploymentId"] = id
		row["name"] = d["name"]
		row["kind"] = d["kind"]
		row["environment"] = d["environment"]
		row["deployStatus"] = d["status"]
		out = append(out, row)
	}
	return out, nil
}

func (s *Server) channelControlPolicyAction(r *http.Request) (any, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 5 {
		return nil, apperr.NotFoundErr(apperr.NotFound, "策略不存在")
	}
	pid, action := parts[3], parts[4]
	ws := s.workspaceID(r)

	if action == "versions" && r.Method == http.MethodGet {
		if _, err := s.requireChannelRead(r); err != nil {
			return nil, err
		}
		s.Store.RLock()
		defer s.Store.RUnlock()
		out := make([]map[string]any, 0)
		for _, v := range s.Store.DeliveryPolicyVersions {
			if str(v["policyId"]) == pid {
				out = append(out, v)
			}
		}
		return out, nil
	}

	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)

	s.Store.Lock()
	defer s.Store.Unlock()
	var p map[string]any
	for _, x := range s.Store.DeliveryPolicies {
		if str(x["id"]) == pid {
			p = x
			break
		}
	}
	if p == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "E_DELIVERY_POLICY_NOT_FOUND: 投递策略不存在")
	}
	if str(p["workspaceId"]) != ws {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "E_CHANNEL_WORKSPACE_SCOPE: 无权操作其他工作区渠道资源")
	}

	switch action {
	case "validate":
		issues := s.validateDeliveryPolicyLocked(p)
		p["validationIssues"] = issues
		if len(issues) == 0 {
			p["status"] = "ready"
		} else {
			p["status"] = "draft"
		}
		result := "success"
		reason := strings.Join(issues, "；")
		if len(issues) > 0 {
			result = "failed"
		}
		s.appendChannelAuditLocked(ws, id.Name, "校验投递策略", coalesce(str(p["eventType"]), pid), result, reason, "")
		go s.persistChannel()
		return p, nil
	case "publish":
		if str(p["status"]) != "ready" {
			return nil, apperr.BadReq(apperr.BadRequest, "E_DELIVERY_POLICY_NOT_READY: 策略尚未通过校验")
		}
		verNum := 0
		for _, v := range s.Store.DeliveryPolicyVersions {
			if str(v["policyId"]) == pid && toInt(v["version"]) > verNum {
				verNum = toInt(v["version"])
			}
		}
		snap := map[string]any{}
		for k, v := range p {
			snap[k] = v
		}
		snap["status"] = "published"
		snap["fallbackDeploymentIds"] = stringSliceAny(p["fallbackDeploymentIds"])
		snap["validationIssues"] = []string{}
		version := map[string]any{
			"id": s.Store.ID("delivery_version"), "policyId": pid, "version": verNum + 1,
			"snapshot": snap, "publishedAt": time.Now().UTC().Format(time.RFC3339), "publishedBy": id.Name,
		}
		s.Store.DeliveryPolicyVersions = append([]map[string]any{version}, s.Store.DeliveryPolicyVersions...)
		p["status"] = "published"
		p["validationIssues"] = []string{}
		s.appendChannelAuditLocked(ws, id.Name, "发布投递策略", coalesce(str(p["eventType"]), pid), "success", str(body["reason"]), "")
		go s.persistChannel()
		return version, nil
	case "simulate":
		issues := s.validateDeliveryPolicyLocked(p)
		status := "passed"
		if len(issues) > 0 {
			status = "blocked"
		}
		risk := "attention"
		if len(stringSliceAny(p["fallbackDeploymentIds"])) > 0 {
			risk = "normal"
		}
		scope := "sandbox"
		if str(body["scope"]) == "canary" {
			scope = "canary"
		}
		return map[string]any{
			"policyId": pid, "scope": scope, "status": status, "issues": issues, "capacityRisk": risk,
		}, nil
	case "rollback":
		vid := str(body["versionId"])
		var target map[string]any
		for _, v := range s.Store.DeliveryPolicyVersions {
			if str(v["id"]) == vid && str(v["policyId"]) == pid {
				target = v
				break
			}
		}
		if target == nil {
			return nil, apperr.NotFoundErr(apperr.NotFound, "E_DELIVERY_VERSION_NOT_FOUND: 策略版本不存在")
		}
		snap, _ := target["snapshot"].(map[string]any)
		if snap == nil {
			return nil, apperr.BadReq(apperr.BadRequest, "版本快照无效")
		}
		issues := s.validateDeliveryPolicyLocked(snap)
		if len(issues) > 0 {
			return nil, apperr.BadReq(apperr.BadRequest, "E_DELIVERY_ROLLBACK_INVALID: "+strings.Join(issues, "；"))
		}
		verNum := 0
		for _, v := range s.Store.DeliveryPolicyVersions {
			if str(v["policyId"]) == pid && toInt(v["version"]) > verNum {
				verNum = toInt(v["version"])
			}
		}
		newSnap := map[string]any{}
		for k, v := range snap {
			newSnap[k] = v
		}
		newSnap["status"] = "published"
		version := map[string]any{
			"id": s.Store.ID("delivery_version"), "policyId": pid, "version": verNum + 1,
			"snapshot": newSnap, "publishedAt": time.Now().UTC().Format(time.RFC3339),
			"publishedBy": id.Name, "rollbackOf": vid,
		}
		s.Store.DeliveryPolicyVersions = append([]map[string]any{version}, s.Store.DeliveryPolicyVersions...)
		for k, v := range newSnap {
			p[k] = v
		}
		s.appendChannelAuditLocked(ws, id.Name, "回滚投递策略", coalesce(str(p["eventType"]), pid), "success", str(body["reason"]), "")
		go s.persistChannel()
		return version, nil
	}
	return nil, apperr.NotFoundErr(apperr.NotFound, "未知动作")
}

func (s *Server) channelControlDeliveries(r *http.Request) (any, error) {
	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)
	ws := s.workspaceID(r)
	s.Store.Lock()
	defer s.Store.Unlock()
	var policy map[string]any
	for _, p := range s.Store.DeliveryPolicies {
		if str(p["id"]) == str(body["policyId"]) {
			policy = p
			break
		}
	}
	if policy == nil {
		return nil, apperr.NotFoundErr(apperr.NotFound, "E_DELIVERY_POLICY_NOT_FOUND: 投递策略不存在")
	}
	if str(policy["workspaceId"]) != ws {
		return nil, apperr.Forbidden(apperr.ChannelWriteForbidden, "E_CHANNEL_WORKSPACE_SCOPE: 无权操作其他工作区渠道资源")
	}
	if str(policy["status"]) != "published" {
		return nil, apperr.BadReq(apperr.BadRequest, "E_DELIVERY_POLICY_NOT_PUBLISHED: 仅已发布策略可以投递")
	}
	target := str(body["target"])
	failed := strings.Contains(target, "fail")
	corr := s.Store.ID("delivery_corr")
	summary := truncateRunes(str(body["content"]), 24)
	summary = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '@' || r == '.' || r == '-' {
			return '*'
		}
		return r
	}, summary)
	attempt := map[string]any{
		"id": s.Store.ID("delivery_attempt"), "workspaceId": ws, "policyId": policy["id"],
		"deploymentId": policy["primaryDeploymentId"],
		"targetMasked": maskTarget(target), "payloadSummary": summary,
		"status": "delivered", "attempts": 1, "correlationId": corr,
		"createdAt": time.Now().UTC().Format(time.RFC3339),
	}
	action := "投递消息"
	result := "success"
	if failed {
		attempt["status"] = "dead_letter"
		attempt["attempts"] = 3
		s.Store.ChannelDLQ = append([]map[string]any{attempt}, s.Store.ChannelDLQ...)
		action = "投递进入死信队列"
		result = "failed"
	}
	s.appendChannelAuditLocked(ws, id.Name, action, coalesce(str(policy["eventType"]), str(policy["id"])), result, "", corr)
	go s.persistChannel()
	return attempt, nil
}

func maskTarget(value string) string {
	value = strings.TrimSpace(value)
	if len(value) < 5 {
		return "***"
	}
	return value[:2] + "***" + value[len(value)-2:]
}

func (s *Server) listChannelTemplates(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, t := range s.Store.ChannelTemplates {
		if str(t["workspaceId"]) == "" || str(t["workspaceId"]) == ws {
			out = append(out, t)
		}
	}
	return out, nil
}

func (s *Server) createChannelTemplate(r *http.Request) (any, error) {
	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)
	name := strings.TrimSpace(str(body["name"]))
	if name == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "模板名称不能为空")
	}
	ws := s.workspaceID(r)
	now := time.Now().UTC().Format(time.RFC3339)
	item := map[string]any{
		"id": s.Store.ID("template"), "workspaceId": ws, "name": name,
		"kind": coalesce(str(body["kind"]), "feishu"), "desc": coalesce(str(body["desc"]), ""),
		"preview": coalesce(str(body["preview"]), ""), "locale": coalesce(str(body["locale"]), "zh-CN"),
		"status": coalesce(str(body["status"]), "draft"), "tone": coalesce(str(body["tone"]), "info"),
		"updatedAt": now,
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.ChannelTemplates = append([]map[string]any{item}, s.Store.ChannelTemplates...)
	s.appendChannelAuditLocked(ws, id.Name, "创建消息模板", name, "success", "", "")
	go s.persistChannel()
	return item, nil
}

func (s *Server) listChannelBlacklist(r *http.Request) (any, error) {
	if _, err := s.requireChannelRead(r); err != nil {
		return nil, err
	}
	ws := s.workspaceID(r)
	s.Store.RLock()
	defer s.Store.RUnlock()
	out := make([]map[string]any, 0)
	for _, b := range s.Store.ChannelBlacklist {
		if str(b["workspaceId"]) == "" || str(b["workspaceId"]) == ws {
			out = append(out, b)
		}
	}
	return out, nil
}

func (s *Server) createChannelBlacklist(r *http.Request) (any, error) {
	id, err := s.requireChannelWrite(r)
	if err != nil {
		return nil, err
	}
	body, _ := decodeMap(r)
	value := strings.TrimSpace(str(body["value"]))
	if value == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "黑名单对象不能为空")
	}
	ws := s.workspaceID(r)
	item := map[string]any{
		"id": s.Store.ID("blacklist"), "workspaceId": ws,
		"type": coalesce(str(body["type"]), "用户"), "value": value,
		"reason": coalesce(str(body["reason"]), "手动添加"), "addedBy": id.Name,
		"expires": coalesce(str(body["expires"]), "永久"),
	}
	s.Store.Lock()
	defer s.Store.Unlock()
	s.Store.ChannelBlacklist = append([]map[string]any{item}, s.Store.ChannelBlacklist...)
	s.appendChannelAuditLocked(ws, id.Name, "加入黑名单", value, "success", "", "")
	go s.persistChannel()
	return item, nil
}
