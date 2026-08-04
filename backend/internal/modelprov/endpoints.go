package modelprov

import "strings"

// JoinModelsURL builds the list-models URL for a protocol + base.
func JoinModelsURL(protocol, baseURL, apiVersion string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	protocol = normalizeProtocol(protocol)
	switch protocol {
	case "ollama":
		// Prefer native tags; if base already ends with /v1 treat as OpenAI-compatible.
		if strings.HasSuffix(base, "/v1") {
			return base + "/models"
		}
		return strings.TrimSuffix(base, "/v1") + "/api/tags"
	case "azure_openai":
		ver := apiVersion
		if ver == "" {
			ver = "2024-10-21"
		}
		return base + "/openai/models?api-version=" + urlQueryEscape(ver)
	case "anthropic":
		if strings.HasSuffix(base, "/v1") {
			return base + "/models"
		}
		return base + "/v1/models"
	case "dashscope":
		if strings.Contains(base, "compatible-mode") || strings.HasSuffix(base, "/v1") {
			if strings.HasSuffix(base, "/v1") {
				return base + "/models"
			}
			return base + "/v1/models"
		}
		return base + "/compatible-mode/v1/models"
	default:
		if strings.HasSuffix(base, "/v1") || strings.HasSuffix(base, "/anthropic") {
			return base + "/models"
		}
		return base + "/v1/models"
	}
}

// DiscoverCandidates returns ordered list-models URLs to try for a base+protocol.
func DiscoverCandidates(protocol, baseURL, apiVersion string) []string {
	primary := JoinModelsURL(protocol, baseURL, apiVersion)
	out := []string{primary}
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	protocol = normalizeProtocol(protocol)

	add := func(u string) {
		if u == "" {
			return
		}
		for _, x := range out {
			if x == u {
				return
			}
		}
		out = append(out, u)
	}

	// DeepSeek / OpenAI-compatible gateways often accept either /models or /v1/models.
	if protocol == "openai_compatible" || protocol == "custom" || protocol == "anthropic" {
		add(base + "/models")
		add(base + "/v1/models")
		if strings.HasSuffix(base, "/anthropic") {
			add(base + "/v1/models")
			// Anthropic-compat on DeepSeek still often exposes OpenAI models listing on root.
			root := strings.TrimSuffix(base, "/anthropic")
			add(root + "/models")
			add(root + "/v1/models")
		}
	}
	if protocol == "ollama" {
		add(base + "/api/tags")
		add(base + "/v1/models")
	}
	return out
}

// InferProtocolFromURL suggests a connect protocol from a provider base URL.
func InferProtocolFromURL(raw string) string {
	u := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case strings.Contains(u, "anthropic.com"):
		return "anthropic"
	case strings.Contains(u, "openai.azure.com"):
		return "azure_openai"
	case strings.Contains(u, "dashscope"):
		return "dashscope"
	case strings.Contains(u, "11434") || strings.Contains(u, "ollama"):
		return "ollama"
	case strings.Contains(u, "deepseek.com"):
		return "openai_compatible"
	case strings.Contains(u, "openai.com"):
		return "openai_compatible"
	case strings.Contains(u, "/v1"):
		return "openai_compatible"
	default:
		return ""
	}
}

// JoinChatURL builds the chat-completions (or native chat) URL for a protocol.
func JoinChatURL(protocol, baseURL, apiVersion, deployment, modelName string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	protocol = normalizeProtocol(protocol)
	switch protocol {
	case "azure_openai":
		ver := apiVersion
		if ver == "" {
			ver = "2024-10-21"
		}
		dep := strings.TrimSpace(deployment)
		if dep == "" {
			dep = strings.TrimSpace(modelName)
		}
		if dep == "" {
			dep = "gpt-4o"
		}
		return base + "/openai/deployments/" + dep + "/chat/completions?api-version=" + urlQueryEscape(ver)
	case "anthropic":
		if strings.HasSuffix(base, "/v1") {
			return base + "/messages"
		}
		return base + "/v1/messages"
	case "ollama":
		if strings.HasSuffix(base, "/v1") {
			return base + "/chat/completions"
		}
		return strings.TrimSuffix(base, "/v1") + "/api/chat"
	case "dashscope":
		if strings.Contains(base, "compatible-mode") || strings.HasSuffix(base, "/v1") {
			if strings.HasSuffix(base, "/v1") {
				return base + "/chat/completions"
			}
			return base + "/v1/chat/completions"
		}
		return base + "/compatible-mode/v1/chat/completions"
	default:
		if strings.HasSuffix(base, "/v1") || strings.HasSuffix(base, "/anthropic") {
			return base + "/chat/completions"
		}
		return base + "/v1/chat/completions"
	}
}
