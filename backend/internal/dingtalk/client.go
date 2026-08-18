// Package dingtalk implements DingTalk Open API helpers for channel deployments
// (aligned with cc-connect platform/dingtalk: client_id + client_secret).
package dingtalk

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const DefaultAPI = "https://api.dingtalk.com"

// Credentials is the vault-stored payload (cc-connect options).
type Credentials struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RobotCode    string `json:"robot_code,omitempty"` // empty → client_id
	Domain       string `json:"domain,omitempty"`     // empty → api.dingtalk.com
}

func (c Credentials) Normalize() Credentials {
	c.ClientID = strings.TrimSpace(c.ClientID)
	c.ClientSecret = strings.TrimSpace(c.ClientSecret)
	c.RobotCode = strings.TrimSpace(c.RobotCode)
	c.Domain = strings.TrimRight(strings.TrimSpace(c.Domain), "/")
	if c.Domain == "" {
		c.Domain = DefaultAPI
	}
	if c.RobotCode == "" {
		c.RobotCode = c.ClientID
	}
	return c
}

func (c Credentials) Valid() bool {
	c = c.Normalize()
	return c.ClientID != "" && c.ClientSecret != ""
}

func (c Credentials) Marshal() (string, error) {
	c = c.Normalize()
	if !c.Valid() {
		return "", fmt.Errorf("client_id and client_secret are required")
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
			return Credentials{}, err
		}
		return c.Normalize(), nil
	}
	// shorthand client_id:client_secret
	if i := strings.IndexByte(raw, ':'); i > 0 {
		c.ClientID, c.ClientSecret = raw[:i], raw[i+1:]
		return c.Normalize(), nil
	}
	return Credentials{}, fmt.Errorf("dingtalk credentials must be JSON or client_id:client_secret")
}

func MaskClientID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "••••••••"
	}
	if len(id) <= 4 {
		return "••••"
	}
	return "••••" + id[len(id)-4:]
}

// Client talks to DingTalk Open APIs (no SDK).
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

// AccessToken POST /v1.0/oauth2/accessToken
func (c *Client) AccessToken(ctx context.Context, cred Credentials) (string, error) {
	cred = cred.Normalize()
	if !cred.Valid() {
		return "", fmt.Errorf("client_id and client_secret are required")
	}
	payload, _ := json.Marshal(map[string]string{
		"appKey": cred.ClientID, "appSecret": cred.ClientSecret,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cred.Domain+"/v1.0/oauth2/accessToken", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("dingtalk token: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("dingtalk token status=%d body=%s", res.StatusCode, truncate(string(body), 200))
	}
	var out struct {
		AccessToken string `json:"accessToken"`
		ExpireIn    int    `json:"expireIn"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("dingtalk token decode: %w", err)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("dingtalk empty accessToken: %s", truncate(string(body), 200))
	}
	return out.AccessToken, nil
}

type ProbeResult struct {
	OK           bool   `json:"ok"`
	Domain       string `json:"domain"`
	RobotCode    string `json:"robotCode,omitempty"`
	LatencyMs    int64  `json:"latencyMs"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

func (c *Client) Probe(ctx context.Context, cred Credentials) ProbeResult {
	cred = cred.Normalize()
	start := time.Now()
	_, err := c.AccessToken(ctx, cred)
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.Domain, RobotCode: cred.RobotCode, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	return ProbeResult{OK: true, Domain: cred.Domain, RobotCode: cred.RobotCode, LatencyMs: time.Since(start).Milliseconds()}
}

// SendText sends a proactive DM via /v1.0/robot/oToMessages/batchSend (sampleMarkdown).
// target is a staff userId.
func (c *Client) SendText(ctx context.Context, cred Credentials, userID, text string) (string, error) {
	cred = cred.Normalize()
	userID = strings.TrimSpace(userID)
	text = strings.TrimSpace(text)
	if userID == "" || text == "" {
		return "", fmt.Errorf("user_id and text are required")
	}
	token, err := c.AccessToken(ctx, cred)
	if err != nil {
		return "", err
	}
	msgParam, _ := json.Marshal(map[string]string{"title": "notify", "text": text})
	payload, _ := json.Marshal(map[string]any{
		"robotCode": cred.RobotCode,
		"userIds":   []string{userID},
		"msgKey":    "sampleMarkdown",
		"msgParam":  string(msgParam),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cred.Domain+"/v1.0/robot/oToMessages/batchSend", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-acs-dingtalk-access-token", token)
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("dingtalk send: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("dingtalk send status=%d body=%s", res.StatusCode, truncate(string(body), 200))
	}
	var out struct {
		ProcessQueryKey string `json:"processQueryKey"`
	}
	_ = json.Unmarshal(body, &out)
	return out.ProcessQueryKey, nil
}

// ReplySession posts a text reply to the robot sessionWebhook (inbound round-trip).
func (c *Client) ReplySession(ctx context.Context, sessionWebhook, text string) error {
	sessionWebhook = strings.TrimSpace(sessionWebhook)
	text = strings.TrimSpace(text)
	if sessionWebhook == "" {
		return fmt.Errorf("session webhook missing")
	}
	if text == "" {
		return fmt.Errorf("text is required")
	}
	payload, _ := json.Marshal(map[string]any{
		"msgtype": "text",
		"text":    map[string]string{"content": text},
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sessionWebhook, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("dingtalk session reply: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<16))
		return fmt.Errorf("dingtalk session reply status=%d body=%s", res.StatusCode, truncate(string(body), 200))
	}
	return nil
}

// VerifyRobotSign checks HTTP robot callback signature:
// Base64(HmacSHA256(timestamp + "\n" + appSecret)).
func VerifyRobotSign(timestamp, sign, appSecret string) bool {
	timestamp = strings.TrimSpace(timestamp)
	sign = strings.TrimSpace(sign)
	appSecret = strings.TrimSpace(appSecret)
	if timestamp == "" || sign == "" || appSecret == "" {
		return false
	}
	// Reject stale timestamps (>1h) when numeric
	if ts, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
		now := time.Now().UnixMilli()
		if ts < 1e12 {
			ts *= 1000
		}
		if delta := now - ts; delta > 3600*1000 || delta < -3600*1000 {
			return false
		}
	}
	mac := hmac.New(sha256.New, []byte(appSecret))
	_, _ = mac.Write([]byte(timestamp + "\n" + appSecret))
	want := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(want), []byte(sign))
}

// InboundMessage is a normalized robot HTTP callback.
type InboundMessage struct {
	MessageID        string `json:"messageId"`
	ConversationID   string `json:"conversationId"`
	ConversationType string `json:"conversationType"`
	SenderID         string `json:"senderId"`
	SenderNick       string `json:"senderNick"`
	Text             string `json:"text"`
	SessionWebhook   string `json:"sessionWebhook"`
}

// ParseRobotCallback parses DingTalk robot HTTP JSON body.
func ParseRobotCallback(raw []byte) (*InboundMessage, error) {
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, fmt.Errorf("invalid json: %w", err)
	}
	msg := &InboundMessage{
		MessageID:        strAny(root["msgId"]),
		ConversationID:   strAny(root["conversationId"]),
		ConversationType: strAny(root["conversationType"]),
		SenderID:         coalesce(strAny(root["senderStaffId"]), strAny(root["senderId"])),
		SenderNick:       strAny(root["senderNick"]),
		SessionWebhook:   strAny(root["sessionWebhook"]),
	}
	if textObj, ok := root["text"].(map[string]any); ok {
		msg.Text = strAny(textObj["content"])
	}
	if msg.Text == "" {
		msg.Text = strAny(root["content"])
	}
	return msg, nil
}

func (m *InboundMessage) ThreadID() string {
	if m == nil {
		return ""
	}
	if id := strings.TrimSpace(m.ConversationID); id != "" {
		return id
	}
	if u := strings.TrimSpace(m.SenderID); u != "" {
		return "user:" + u
	}
	return ""
}

func strAny(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatInt(int64(t), 10)
	case json.Number:
		return t.String()
	default:
		return ""
	}
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
