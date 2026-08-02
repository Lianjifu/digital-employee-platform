package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
)

type oidcDiscovery struct {
	AuthorizationEndpoint string `json:"authorization_endpoint"`
	TokenEndpoint         string `json:"token_endpoint"`
	UserinfoEndpoint      string `json:"userinfo_endpoint"`
}

var (
	discoveryMu    sync.Mutex
	discoveryCache = map[string]oidcDiscovery{}
)

func (c OIDCConfig) resolveEndpoints(ctx context.Context) (authURL, tokenURL, userInfoURL string, err error) {
	issuer := strings.TrimRight(c.Issuer, "/")
	if issuer == "" {
		return "", "", "", fmt.Errorf("OIDC issuer empty")
	}

	// Explicit overrides win (tests / non-discoverable IdPs).
	if c.TokenURL != "" && c.UserInfoURL != "" {
		path := c.AuthPath
		if path == "" {
			path = "/authorize"
		}
		if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
			authURL = path
		} else {
			if !strings.HasPrefix(path, "/") {
				path = "/" + path
			}
			authURL = issuer + path
		}
		return authURL, c.TokenURL, c.UserInfoURL, nil
	}

	disc, err := c.fetchDiscovery(ctx, issuer)
	if err == nil && disc.AuthorizationEndpoint != "" && disc.TokenEndpoint != "" {
		authURL = disc.AuthorizationEndpoint
		tokenURL = disc.TokenEndpoint
		userInfoURL = disc.UserinfoEndpoint
		if c.TokenURL != "" {
			tokenURL = c.TokenURL
		}
		if c.UserInfoURL != "" {
			userInfoURL = c.UserInfoURL
		}
		return authURL, tokenURL, userInfoURL, nil
	}

	// Fallback: Dex-style issuer-relative paths.
	path := c.AuthPath
	if path == "" {
		path = "/authorize"
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	authURL = issuer + path
	tokenURL = c.TokenURL
	if tokenURL == "" {
		tokenURL = issuer + "/token"
	}
	userInfoURL = c.UserInfoURL
	if userInfoURL == "" {
		userInfoURL = issuer + "/userinfo"
	}
	return authURL, tokenURL, userInfoURL, nil
}

func (c OIDCConfig) fetchDiscovery(ctx context.Context, issuer string) (oidcDiscovery, error) {
	discoveryMu.Lock()
	if d, ok := discoveryCache[issuer]; ok {
		discoveryMu.Unlock()
		return d, nil
	}
	discoveryMu.Unlock()

	url := issuer + "/.well-known/openid-configuration"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return oidcDiscovery{}, err
	}
	res, err := c.client().Do(req)
	if err != nil {
		return oidcDiscovery{}, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return oidcDiscovery{}, fmt.Errorf("oidc discovery %d: %s", res.StatusCode, string(body))
	}
	var d oidcDiscovery
	if err := json.Unmarshal(body, &d); err != nil {
		return oidcDiscovery{}, err
	}
	discoveryMu.Lock()
	discoveryCache[issuer] = d
	discoveryMu.Unlock()
	return d, nil
}

// ClearDiscoveryCache is for tests.
func ClearDiscoveryCache() {
	discoveryMu.Lock()
	discoveryCache = map[string]oidcDiscovery{}
	discoveryMu.Unlock()
}
