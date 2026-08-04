// Package weixin implements personal WeChat (ilink) helpers aligned with
// cc-connect platform/weixin: Bearer token + getUpdates / sendMessage.
package weixin

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	DefaultBaseURL = "https://ilinkai.weixin.qq.com"
	channelVersion = "de-platform-weixin/1.0"
)

// Credentials vault JSON (cc-connect weixin options).
type Credentials struct {
	Token      string `json:"token"`
	BaseURL    string `json:"base_url,omitempty"`
	AccountID  string `json:"account_id,omitempty"`
	AllowFrom  string `json:"allow_from,omitempty"`
	RouteTag   string `json:"route_tag,omitempty"`
	ContextTok string `json:"context_token,omitempty"` // last known; optional for outbound
}

func (c Credentials) Normalize() Credentials {
	c.Token = strings.TrimSpace(c.Token)
	c.BaseURL = strings.TrimRight(strings.TrimSpace(c.BaseURL), "/")
	c.AccountID = strings.TrimSpace(c.AccountID)
	c.AllowFrom = strings.TrimSpace(c.AllowFrom)
	c.RouteTag = strings.TrimSpace(c.RouteTag)
	c.ContextTok = strings.TrimSpace(c.ContextTok)
	if c.BaseURL == "" {
		c.BaseURL = DefaultBaseURL
	}
	return c
}

func (c Credentials) Valid() bool {
	return c.Normalize().Token != ""
}

func (c Credentials) Marshal() (string, error) {
	c = c.Normalize()
	if !c.Valid() {
		return "", fmt.Errorf("token is required")
	}
	b, err := json.Marshal(c)
	return string(b), err
}

func ParseCredentials(raw string) (Credentials, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Credentials{}, fmt.Errorf("empty credentials")
	}
	if strings.HasPrefix(raw, "{") {
		var c Credentials
		if err := json.Unmarshal([]byte(raw), &c); err != nil {
			return Credentials{}, err
		}
		return c.Normalize(), nil
	}
	// bare token
	return Credentials{Token: raw}.Normalize(), nil
}

func MaskToken(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return "••••••••"
	}
	if len(token) <= 6 {
		return "••••"
	}
	return "••••" + token[len(token)-4:]
}

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

func randomUIN() string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	u := uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
	return base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%d", u)))
}

func (c *Client) post(ctx context.Context, cred Credentials, endpoint string, payload []byte) ([]byte, error) {
	cred = cred.Normalize()
	url := cred.BaseURL + "/" + strings.TrimPrefix(endpoint, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("AuthorizationType", "ilink_bot_token")
	req.Header.Set("Authorization", "Bearer "+cred.Token)
	req.Header.Set("X-WECHAT-UIN", randomUIN())
	if cred.RouteTag != "" {
		req.Header.Set("SKRouteTag", cred.RouteTag)
	}
	res, err := c.httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("weixin http %d: %s", res.StatusCode, truncate(string(body), 200))
	}
	return body, nil
}

type ProbeResult struct {
	OK           bool   `json:"ok"`
	Domain       string `json:"domain"`
	AccountID    string `json:"accountId,omitempty"`
	LatencyMs    int64  `json:"latencyMs"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// Probe validates the ilink token with a short getUpdates call.
func (c *Client) Probe(ctx context.Context, cred Credentials) ProbeResult {
	cred = cred.Normalize()
	start := time.Now()
	if !cred.Valid() {
		return ProbeResult{OK: false, Domain: cred.BaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: "token required"}
	}
	payload, _ := json.Marshal(map[string]any{
		"get_updates_buf": "",
		"base_info":       map[string]string{"channel_version": channelVersion},
	})
	// Prefer short timeout for probe
	pctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	raw, err := c.post(pctx, cred, "ilink/bot/getupdates", payload)
	if err != nil {
		// Deadline with empty response is often OK for long-poll semantics when auth worked
		if pctx.Err() != nil {
			return ProbeResult{OK: true, Domain: cred.BaseURL, AccountID: cred.AccountID, LatencyMs: time.Since(start).Milliseconds()}
		}
		return ProbeResult{OK: false, Domain: cred.BaseURL, AccountID: cred.AccountID, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	var out struct {
		Ret     int    `json:"ret"`
		Errcode int    `json:"errcode"`
		Errmsg  string `json:"errmsg"`
	}
	_ = json.Unmarshal(raw, &out)
	if out.Ret != 0 && out.Errcode != 0 {
		return ProbeResult{OK: false, Domain: cred.BaseURL, AccountID: cred.AccountID, LatencyMs: time.Since(start).Milliseconds(),
			ErrorMessage: fmt.Sprintf("ret=%d errcode=%d %s", out.Ret, out.Errcode, out.Errmsg)}
	}
	return ProbeResult{OK: true, Domain: cred.BaseURL, AccountID: cred.AccountID, LatencyMs: time.Since(start).Milliseconds()}
}

// SendText requires context_token from a prior inbound session (ilink protocol).
func (c *Client) SendText(ctx context.Context, cred Credentials, toUserID, text, contextToken, clientID string) error {
	cred = cred.Normalize()
	toUserID = strings.TrimSpace(toUserID)
	text = strings.TrimSpace(text)
	contextToken = strings.TrimSpace(coalesce(contextToken, cred.ContextTok))
	if toUserID == "" || text == "" {
		return fmt.Errorf("to_user_id and text are required")
	}
	if contextToken == "" {
		return fmt.Errorf("context_token is required for weixin send (receive a message first)")
	}
	if clientID == "" {
		clientID = fmt.Sprintf("de-%d", time.Now().UnixNano())
	}
	msg := map[string]any{
		"base_info": map[string]string{"channel_version": channelVersion},
		"msg": map[string]any{
			"from_user_id":  "",
			"to_user_id":    toUserID,
			"client_id":     clientID,
			"message_type":  2,
			"message_state": 2,
			"context_token": contextToken,
			"item_list": []map[string]any{
				{"type": 1, "text_item": map[string]string{"text": text}},
			},
		},
	}
	payload, _ := json.Marshal(msg)
	raw, err := c.post(ctx, cred, "ilink/bot/sendmessage", payload)
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		return nil
	}
	var resp struct {
		Ret     int    `json:"ret"`
		Errcode int    `json:"errcode"`
		Errmsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(raw, &resp); err != nil {
		return fmt.Errorf("weixin send decode: %w", err)
	}
	if resp.Ret != 0 {
		return fmt.Errorf("weixin send ret=%d errcode=%d %s", resp.Ret, resp.Errcode, resp.Errmsg)
	}
	return nil
}

func coalesce(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
