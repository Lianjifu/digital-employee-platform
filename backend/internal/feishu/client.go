// Package feishu implements Feishu/Lark Open API helpers for channel deployments.
// Credential and probe flow mirror cc-connect (platform/feishu): app_id + app_secret →
// tenant_access_token → bot/v3/info; outbound text via im/v1/messages.
package feishu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	DefaultDomain = "https://open.feishu.cn"
	LarkDomain    = "https://open.larksuite.com"
)

// Credentials is the vault-stored payload for a Feishu/Lark bot deployment
// (same fields as cc-connect projects.platforms.options).
type Credentials struct {
	AppID             string `json:"app_id"`
	AppSecret         string `json:"app_secret"`
	Domain            string `json:"domain,omitempty"` // empty → Feishu CN
	EncryptKey        string `json:"encrypt_key,omitempty"`
	VerificationToken string `json:"verification_token,omitempty"`
}

func (c Credentials) Normalize() Credentials {
	c.AppID = strings.TrimSpace(c.AppID)
	c.AppSecret = strings.TrimSpace(c.AppSecret)
	c.Domain = strings.TrimRight(strings.TrimSpace(c.Domain), "/")
	c.EncryptKey = strings.TrimSpace(c.EncryptKey)
	c.VerificationToken = strings.TrimSpace(c.VerificationToken)
	if c.Domain == "" {
		c.Domain = DefaultDomain
	}
	return c
}

func (c Credentials) Valid() bool {
	c = c.Normalize()
	return c.AppID != "" && c.AppSecret != ""
}

func (c Credentials) Marshal() (string, error) {
	c = c.Normalize()
	if !c.Valid() {
		return "", fmt.Errorf("app_id and app_secret are required")
	}
	b, err := json.Marshal(c)
	return string(b), err
}

func ParseCredentials(raw string) (Credentials, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Credentials{}, fmt.Errorf("empty credentials")
	}
	var c Credentials
	if strings.HasPrefix(raw, "{") {
		if err := json.Unmarshal([]byte(raw), &c); err != nil {
			return Credentials{}, fmt.Errorf("parse feishu credentials: %w", err)
		}
		return c.Normalize(), nil
	}
	// Legacy / bind shorthand: "cli_xxx:secret" (cc-connect --app form)
	if i := strings.IndexByte(raw, ':'); i > 0 {
		c.AppID = raw[:i]
		c.AppSecret = raw[i+1:]
		return c.Normalize(), nil
	}
	return Credentials{}, fmt.Errorf("feishu credentials must be JSON or app_id:app_secret")
}

// BotInfo is a subset of /open-apis/bot/v3/info.
type BotInfo struct {
	OpenID   string `json:"open_id"`
	AppName  string `json:"app_name"`
	AvatarURL string `json:"avatar_url"`
}

// ProbeResult is returned by connectivity verification.
type ProbeResult struct {
	OK           bool   `json:"ok"`
	BotOpenID    string `json:"botOpenId,omitempty"`
	BotName      string `json:"botName,omitempty"`
	Domain       string `json:"domain"`
	LatencyMs    int64  `json:"latencyMs"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// Client talks to Feishu/Lark Open APIs over HTTP (no SDK dependency).
type Client struct {
	HTTP *http.Client
}

func NewClient() *Client {
	return &Client{HTTP: &http.Client{Timeout: 12 * time.Second}}
}

func (c *Client) httpClient() *http.Client {
	if c != nil && c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 12 * time.Second}
}

type tokenResp struct {
	Code              int    `json:"code"`
	Msg               string `json:"msg"`
	TenantAccessToken string `json:"tenant_access_token"`
	Expire            int    `json:"expire"`
}

// TenantAccessToken exchanges app credentials for a tenant token
// (POST /open-apis/auth/v3/tenant_access_token/internal).
func (c *Client) TenantAccessToken(ctx context.Context, cred Credentials) (string, error) {
	cred = cred.Normalize()
	if !cred.Valid() {
		return "", fmt.Errorf("app_id and app_secret are required")
	}
	payload, _ := json.Marshal(map[string]string{
		"app_id":     cred.AppID,
		"app_secret": cred.AppSecret,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cred.Domain+"/open-apis/auth/v3/tenant_access_token/internal", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("feishu token request: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out tokenResp
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("feishu token decode: %w", err)
	}
	if out.Code != 0 || out.TenantAccessToken == "" {
		return "", fmt.Errorf("feishu token code=%d msg=%s", out.Code, coalesce(out.Msg, string(body)))
	}
	return out.TenantAccessToken, nil
}

type botInfoResp struct {
	Code int `json:"code"`
	Msg  string `json:"msg"`
	Bot  struct {
		OpenID    string `json:"open_id"`
		AppName   string `json:"app_name"`
		AvatarURL string `json:"avatar_url"`
	} `json:"bot"`
}

// BotInfo calls GET /open-apis/bot/v3/info (same probe used by cc-connect on start).
func (c *Client) BotInfo(ctx context.Context, domain, token string) (BotInfo, error) {
	domain = strings.TrimRight(strings.TrimSpace(domain), "/")
	if domain == "" {
		domain = DefaultDomain
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, domain+"/open-apis/bot/v3/info", nil)
	if err != nil {
		return BotInfo{}, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := c.httpClient().Do(req)
	if err != nil {
		return BotInfo{}, fmt.Errorf("feishu bot info: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out botInfoResp
	if err := json.Unmarshal(body, &out); err != nil {
		return BotInfo{}, fmt.Errorf("feishu bot info decode: %w", err)
	}
	if out.Code != 0 {
		return BotInfo{}, fmt.Errorf("feishu bot info code=%d msg=%s", out.Code, coalesce(out.Msg, string(body)))
	}
	return BotInfo{OpenID: out.Bot.OpenID, AppName: out.Bot.AppName, AvatarURL: out.Bot.AvatarURL}, nil
}

// Probe obtains a token and bot identity — connectivity verification for channel deploy.
func (c *Client) Probe(ctx context.Context, cred Credentials) ProbeResult {
	cred = cred.Normalize()
	start := time.Now()
	token, err := c.TenantAccessToken(ctx, cred)
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.Domain, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	info, err := c.BotInfo(ctx, cred.Domain, token)
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.Domain, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	return ProbeResult{
		OK: true, BotOpenID: info.OpenID, BotName: info.AppName,
		Domain: cred.Domain, LatencyMs: time.Since(start).Milliseconds(),
	}
}

// SendText posts a text message via im/v1/messages.
// receiveIDType: open_id | user_id | union_id | email | chat_id
func (c *Client) SendText(ctx context.Context, cred Credentials, receiveIDType, receiveID, text string) (messageID string, err error) {
	cred = cred.Normalize()
	token, err := c.TenantAccessToken(ctx, cred)
	if err != nil {
		return "", err
	}
	receiveIDType = strings.TrimSpace(receiveIDType)
	if receiveIDType == "" {
		receiveIDType = "chat_id"
	}
	receiveID = strings.TrimSpace(receiveID)
	text = strings.TrimSpace(text)
	if receiveID == "" || text == "" {
		return "", fmt.Errorf("receive_id and text are required")
	}
	content, _ := json.Marshal(map[string]string{"text": text})
	payload, _ := json.Marshal(map[string]any{
		"receive_id": receiveID,
		"msg_type":   "text",
		"content":    string(content),
	})
	u, _ := url.Parse(cred.Domain + "/open-apis/im/v1/messages")
	q := u.Query()
	q.Set("receive_id_type", receiveIDType)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("feishu send: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			MessageID string `json:"message_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("feishu send decode: %w", err)
	}
	if out.Code != 0 {
		return "", fmt.Errorf("feishu send code=%d msg=%s", out.Code, coalesce(out.Msg, string(body)))
	}
	return out.Data.MessageID, nil
}

func coalesce(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// MaskAppID returns a masked app id for UI (•••• + last 4).
func MaskAppID(appID string) string {
	appID = strings.TrimSpace(appID)
	if appID == "" {
		return "••••••••"
	}
	if len(appID) <= 4 {
		return "••••"
	}
	return "••••" + appID[len(appID)-4:]
}
