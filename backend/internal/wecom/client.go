// Package wecom implements WeChat Work (企业微信) Open API helpers for
// enterprise self-built apps (aligned with cc-connect platform/wecom webhook mode).
package wecom

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const DefaultAPI = "https://qyapi.weixin.qq.com"

// Credentials is the vault-stored payload for 企业自建应用 (cc-connect wecom webhook).
type Credentials struct {
	CorpID         string `json:"corp_id"`
	CorpSecret     string `json:"corp_secret"`
	AgentID        string `json:"agent_id"`
	CallbackToken  string `json:"callback_token,omitempty"`
	CallbackAESKey string `json:"callback_aes_key,omitempty"` // 43-char EncodingAESKey
	APIBaseURL     string `json:"api_base_url,omitempty"`
	// Websocket (智能机器人) — optional alternate mode
	BotID     string `json:"bot_id,omitempty"`
	BotSecret string `json:"bot_secret,omitempty"`
	Mode      string `json:"mode,omitempty"` // webhook | websocket
}

func (c Credentials) Normalize() Credentials {
	c.CorpID = strings.TrimSpace(c.CorpID)
	c.CorpSecret = strings.TrimSpace(c.CorpSecret)
	c.AgentID = strings.TrimSpace(c.AgentID)
	c.CallbackToken = strings.TrimSpace(c.CallbackToken)
	c.CallbackAESKey = strings.TrimSpace(c.CallbackAESKey)
	c.APIBaseURL = strings.TrimRight(strings.TrimSpace(c.APIBaseURL), "/")
	c.BotID = strings.TrimSpace(c.BotID)
	c.BotSecret = strings.TrimSpace(c.BotSecret)
	c.Mode = strings.TrimSpace(c.Mode)
	if c.APIBaseURL == "" {
		c.APIBaseURL = DefaultAPI
	}
	if c.Mode == "" {
		if c.BotID != "" && c.BotSecret != "" && c.CorpID == "" {
			c.Mode = "websocket"
		} else {
			c.Mode = "webhook"
		}
	}
	return c
}

func (c Credentials) Valid() bool {
	c = c.Normalize()
	if c.Mode == "websocket" {
		return c.BotID != "" && c.BotSecret != ""
	}
	return c.CorpID != "" && c.CorpSecret != "" && c.AgentID != ""
}

func (c Credentials) Marshal() (string, error) {
	c = c.Normalize()
	if !c.Valid() {
		return "", fmt.Errorf("wecom credentials incomplete")
	}
	b, err := json.Marshal(c)
	return string(b), err
}

func ParseCredentials(raw string) (Credentials, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Credentials{}, fmt.Errorf("empty credentials")
	}
	if !strings.HasPrefix(raw, "{") {
		return Credentials{}, fmt.Errorf("wecom credentials must be JSON")
	}
	var c Credentials
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return Credentials{}, err
	}
	return c.Normalize(), nil
}

func MaskID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "••••••••"
	}
	if len(id) <= 4 {
		return "••••"
	}
	return "••••" + id[len(id)-4:]
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

func (c *Client) AccessToken(ctx context.Context, cred Credentials) (string, error) {
	cred = cred.Normalize()
	if cred.Mode == "websocket" {
		return "", fmt.Errorf("websocket mode has no gettoken; use bot long-connection sidecar")
	}
	if !cred.Valid() {
		return "", fmt.Errorf("corp_id, corp_secret, agent_id required")
	}
	u, _ := url.Parse(cred.APIBaseURL + "/cgi-bin/gettoken")
	q := u.Query()
	q.Set("corpid", cred.CorpID)
	q.Set("corpsecret", cred.CorpSecret)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("wecom token: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("wecom token decode: %w", err)
	}
	if out.ErrCode != 0 || out.AccessToken == "" {
		return "", fmt.Errorf("wecom token errcode=%d errmsg=%s", out.ErrCode, coalesce(out.ErrMsg, string(body)))
	}
	return out.AccessToken, nil
}

type ProbeResult struct {
	OK           bool   `json:"ok"`
	Domain       string `json:"domain"`
	AgentID      string `json:"agentId,omitempty"`
	Mode         string `json:"mode"`
	LatencyMs    int64  `json:"latencyMs"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

func (c *Client) Probe(ctx context.Context, cred Credentials) ProbeResult {
	cred = cred.Normalize()
	start := time.Now()
	if cred.Mode == "websocket" {
		if !cred.Valid() {
			return ProbeResult{OK: false, Mode: cred.Mode, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: "bot_id and bot_secret required"}
		}
		// Long-connection probe is deferred to sidecar; credentials shape OK.
		return ProbeResult{OK: true, Mode: cred.Mode, Domain: "wss://openws.work.weixin.qq.com", LatencyMs: time.Since(start).Milliseconds()}
	}
	_, err := c.AccessToken(ctx, cred)
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.APIBaseURL, AgentID: cred.AgentID, Mode: cred.Mode, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	return ProbeResult{OK: true, Domain: cred.APIBaseURL, AgentID: cred.AgentID, Mode: cred.Mode, LatencyMs: time.Since(start).Milliseconds()}
}

// SendText posts /cgi-bin/message/send text.
func (c *Client) SendText(ctx context.Context, cred Credentials, toUser, text string) (string, error) {
	cred = cred.Normalize()
	toUser = strings.TrimSpace(toUser)
	text = strings.TrimSpace(text)
	if toUser == "" || text == "" {
		return "", fmt.Errorf("touser and text are required")
	}
	if cred.Mode == "websocket" {
		return "", fmt.Errorf("websocket mode outbound requires sidecar")
	}
	token, err := c.AccessToken(ctx, cred)
	if err != nil {
		return "", err
	}
	agentID, _ := strconv.Atoi(cred.AgentID)
	payload, _ := json.Marshal(map[string]any{
		"touser": toUser, "msgtype": "text", "agentid": agentID,
		"text": map[string]string{"content": text}, "safe": 0,
	})
	u, _ := url.Parse(cred.APIBaseURL + "/cgi-bin/message/send")
	q := u.Query()
	q.Set("access_token", token)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u.String(), bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("wecom send: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
		MsgID   string `json:"msgid"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("wecom send decode: %w", err)
	}
	if out.ErrCode != 0 {
		return "", fmt.Errorf("wecom send errcode=%d errmsg=%s", out.ErrCode, coalesce(out.ErrMsg, string(body)))
	}
	return out.MsgID, nil
}

// --- Callback crypto (企业微信消息加解密) ---

func DecodeAESKey(encodingAESKey string) ([]byte, error) {
	encodingAESKey = strings.TrimSpace(encodingAESKey)
	if len(encodingAESKey) != 43 {
		return nil, fmt.Errorf("EncodingAESKey must be 43 characters, got %d", len(encodingAESKey))
	}
	return base64.StdEncoding.DecodeString(encodingAESKey + "=")
}

func VerifySignature(token, timestamp, nonce, encrypt, expected string) bool {
	parts := []string{token, timestamp, nonce, encrypt}
	sort.Strings(parts)
	h := sha1.New()
	_, _ = h.Write([]byte(strings.Join(parts, "")))
	got := fmt.Sprintf("%x", h.Sum(nil))
	return strings.EqualFold(got, strings.TrimSpace(expected))
}

// DecryptMsg decrypts EncodingAESKey ciphertext; returns plaintext XML/string and corpID suffix.
func DecryptMsg(aesKey []byte, cipherBase64, expectCorpID string) (plain string, err error) {
	cipherData, err := base64.StdEncoding.DecodeString(strings.TrimSpace(cipherBase64))
	if err != nil {
		return "", fmt.Errorf("base64: %w", err)
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}
	if len(cipherData) < aes.BlockSize || len(cipherData)%aes.BlockSize != 0 {
		return "", fmt.Errorf("invalid ciphertext length")
	}
	iv := aesKey[:16]
	mode := cipher.NewCBCDecrypter(block, iv)
	buf := make([]byte, len(cipherData))
	mode.CryptBlocks(buf, cipherData)
	buf = pkcs7Unpad(buf)
	if len(buf) < 20 {
		return "", fmt.Errorf("decrypted data too short")
	}
	msgLen := int(binary.BigEndian.Uint32(buf[16:20]))
	if 20+msgLen > len(buf) {
		return "", fmt.Errorf("invalid message length")
	}
	msg := string(buf[20 : 20+msgLen])
	corpID := string(buf[20+msgLen:])
	if expectCorpID != "" && corpID != expectCorpID {
		return "", fmt.Errorf("corp_id mismatch")
	}
	return msg, nil
}

func pkcs7Unpad(data []byte) []byte {
	if len(data) == 0 {
		return data
	}
	pad := int(data[len(data)-1])
	if pad < 1 || pad > 32 || pad > len(data) {
		return data
	}
	return data[:len(data)-pad]
}

type xmlEncryptedMsg struct {
	XMLName xml.Name `xml:"xml"`
	Encrypt string   `xml:"Encrypt"`
}

type xmlMessage struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
	MsgID        int64    `xml:"MsgId"`
	AgentID      int64    `xml:"AgentID"`
}

// InboundMessage normalized wecom callback.
type InboundMessage struct {
	MsgID        string `json:"msgId"`
	FromUserName string `json:"fromUserName"`
	MsgType      string `json:"msgType"`
	Text         string `json:"text"`
	AgentID      string `json:"agentId"`
}

// ParseEncryptedCallback verifies signature and decrypts POST body.
func ParseEncryptedCallback(cred Credentials, msgSig, timestamp, nonce string, body []byte) (*InboundMessage, error) {
	cred = cred.Normalize()
	if cred.CallbackToken == "" || cred.CallbackAESKey == "" {
		return nil, fmt.Errorf("callback_token and callback_aes_key required")
	}
	var enc xmlEncryptedMsg
	if err := xml.Unmarshal(body, &enc); err != nil {
		return nil, fmt.Errorf("parse xml: %w", err)
	}
	if !VerifySignature(cred.CallbackToken, timestamp, nonce, enc.Encrypt, msgSig) {
		return nil, fmt.Errorf("invalid signature")
	}
	aesKey, err := DecodeAESKey(cred.CallbackAESKey)
	if err != nil {
		return nil, err
	}
	plain, err := DecryptMsg(aesKey, enc.Encrypt, cred.CorpID)
	if err != nil {
		return nil, err
	}
	var msg xmlMessage
	if err := xml.Unmarshal([]byte(plain), &msg); err != nil {
		return nil, fmt.Errorf("parse inner xml: %w", err)
	}
	return &InboundMessage{
		MsgID: strconv.FormatInt(msg.MsgID, 10),
		FromUserName: msg.FromUserName,
		MsgType: msg.MsgType,
		Text: msg.Content,
		AgentID: strconv.FormatInt(msg.AgentID, 10),
	}, nil
}

// VerifyURLEcho decrypts echostr for GET URL verification; returns plaintext echo.
func VerifyURLEcho(cred Credentials, msgSig, timestamp, nonce, echostr string) (string, error) {
	cred = cred.Normalize()
	if !VerifySignature(cred.CallbackToken, timestamp, nonce, echostr, msgSig) {
		return "", fmt.Errorf("invalid signature")
	}
	aesKey, err := DecodeAESKey(cred.CallbackAESKey)
	if err != nil {
		return "", err
	}
	return DecryptMsg(aesKey, echostr, cred.CorpID)
}

func coalesce(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}
