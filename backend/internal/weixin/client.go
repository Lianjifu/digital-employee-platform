// Package weixin implements both the Personal WeChat (个人微信) ilink-sidecar
// protocol (long-poll) and WeChat Official Account (公众号) Open API.
//
// The Personal WeChat path is the default and the one exercised by the
// channel-control flow: an external ilink sidecar (gekwoon/ilink or
// equivalent) hosts HTTP endpoints like /ilink/bot/getupdates and
// /ilink/bot/sendmsg; this client talks to it using the bind token + baseUrl.
//
// The Official Account path (AppID/AppSecret + AES-CBC callback) is also
// implemented for completeness; Activate via Valid()/HasCallback() to
// dispatch.
package weixin

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	DefaultAPIBase = "https://api.weixin.qq.com"
	// ilinkGetUpdates is the long-poll entry point probed by Verify() and
	// used to fetch inbound messages from the ilink sidecar.
	ilinkGetUpdates = "/ilink/bot/getupdates"
	// ilinkSendMsg is the send-text endpoint on the ilink sidecar.
	ilinkSendMsg = "/ilink/bot/sendmsg"
)

// Mode distinguishes the two flavors this package supports.
type Mode string

const (
	ModePersonal Mode = "personal" // ilink sidecar (long-poll)
	ModeOfficial Mode = "official" // 公众号 Open API
)

// Credentials is the vault-stored payload for a WeChat deployment.
//
// Personal WeChat (ilink): Token + BaseURL are required; the rest is set
//   after the sidecar binds to a WeChat account.
// Official Account (公众号): AppID + AppSecret + CallbackToken +
//   EncodingAESKey + APIBaseURL.
type Credentials struct {
	Mode Mode `json:"mode,omitempty"` // empty → auto-detect

	// --- Personal WeChat (ilink) ---
	Token     string `json:"token,omitempty"`      // ilink bind token
	BaseURL   string `json:"baseUrl,omitempty"`    // ilink sidecar URL
	AccountID string `json:"accountId,omitempty"`  // bound account id (set after scan)
	AllowFrom string `json:"allowFrom,omitempty"`  // csv of allowed senders
	RouteTag  string `json:"routeTag,omitempty"`   // routing tag

	// --- Official Account (公众号) ---
	AppID          string `json:"app_id,omitempty"`
	AppSecret      string `json:"app_secret,omitempty"`
	CallbackToken  string `json:"callback_token,omitempty"`
	EncodingAESKey string `json:"encoding_aes_key,omitempty"` // 43 chars
	APIBaseURL     string `json:"api_base_url,omitempty"`
}

// EffectiveMode picks Mode based on which credential set is populated.
func (c Credentials) EffectiveMode() Mode {
	if c.Mode != "" {
		return c.Mode
	}
	if c.Token != "" && c.BaseURL != "" {
		return ModePersonal
	}
	return ModeOfficial
}

// Normalize trims whitespace and applies sensible defaults.
func (c Credentials) Normalize() Credentials {
	c.Token = strings.TrimSpace(c.Token)
	c.BaseURL = strings.TrimSpace(c.BaseURL)
	c.AccountID = strings.TrimSpace(c.AccountID)
	c.AllowFrom = strings.TrimSpace(c.AllowFrom)
	c.RouteTag = strings.TrimSpace(c.RouteTag)
	c.AppID = strings.TrimSpace(c.AppID)
	c.AppSecret = strings.TrimSpace(c.AppSecret)
	c.CallbackToken = strings.TrimSpace(c.CallbackToken)
	c.EncodingAESKey = strings.TrimSpace(c.EncodingAESKey)
	c.APIBaseURL = strings.TrimRight(strings.TrimSpace(c.APIBaseURL), "/")
	c.BaseURL = strings.TrimRight(c.BaseURL, "/")
	if c.APIBaseURL == "" {
		c.APIBaseURL = DefaultAPIBase
	}
	if c.Mode == "" {
		c.Mode = c.EffectiveMode()
	}
	return c
}

// Valid reports whether the credential set has enough fields to attempt
// at least one operation. Personal needs token+baseUrl; Official needs
// app_id+app_secret.
func (c Credentials) Valid() bool {
	c = c.Normalize()
	switch c.EffectiveMode() {
	case ModePersonal:
		return c.Token != "" && c.BaseURL != ""
	case ModeOfficial:
		return c.AppID != "" && c.AppSecret != ""
	}
	return false
}

// HasCallback reports whether inbound callback crypto is configured.
func (c Credentials) HasCallback() bool {
	c = c.Normalize()
	return c.CallbackToken != "" && len(c.EncodingAESKey) == 43
}

func (c Credentials) Marshal() (string, error) {
	c = c.Normalize()
	if !c.Valid() {
		return "", fmt.Errorf("weixin credentials incomplete")
	}
	b, err := json.Marshal(c)
	return string(b), err
}

// ParseCredentials decodes a vault-stored JSON blob into Credentials.
func ParseCredentials(s string) (Credentials, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Credentials{}, fmt.Errorf("empty credentials")
	}
	var c Credentials
	if err := json.Unmarshal([]byte(s), &c); err != nil {
		return Credentials{}, fmt.Errorf("weixin credentials: %w", err)
	}
	return c.Normalize(), nil
}

// MaskToken returns a non-reversible display form for the ilink token.
func MaskToken(t string) string {
	t = strings.TrimSpace(t)
	if len(t) <= 6 {
		return strings.Repeat("*", len(t))
	}
	return t[:3] + strings.Repeat("*", len(t)-6) + t[len(t)-3:]
}

// --- Client ---

// Client is a tiny WeChat client. HTTP is exported so tests can inject
// transport.
type Client struct {
	HTTP *http.Client

	tokenMu  sync.Mutex
	token    string
	tokenExp time.Time
}

// NewClient returns a Client with a 12s timeout.
func NewClient() *Client {
	return &Client{HTTP: &http.Client{Timeout: 12 * time.Second}}
}

func (c *Client) httpClient() *http.Client {
	if c != nil && c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: 12 * time.Second}
}

// --- Personal WeChat (ilink) ---

// ProbeResult summarizes a credential probe.
type ProbeResult struct {
	OK           bool   `json:"ok"`
	Mode         Mode   `json:"mode,omitempty"`
	Domain       string `json:"domain,omitempty"`
	AccountID    string `json:"accountId,omitempty"`
	LatencyMs    int64  `json:"latencyMs"`
	ErrorMessage string `json:"errorMessage,omitempty"`
}

// Probe verifies the deployment by issuing a no-op call against the
// appropriate endpoint (ilink long-poll or OA /cgi-bin/token).
func (c *Client) Probe(ctx context.Context, cred Credentials) ProbeResult {
	cred = cred.Normalize()
	start := time.Now()
	if !cred.Valid() {
		return ProbeResult{OK: false, Domain: domainFor(cred), LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: "weixin credentials incomplete"}
	}
	switch cred.EffectiveMode() {
	case ModePersonal:
		return c.probePersonal(ctx, cred, start)
	case ModeOfficial:
		return c.probeOfficial(ctx, cred, start)
	}
	return ProbeResult{OK: false, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: "unknown mode"}
}

func (c *Client) probePersonal(ctx context.Context, cred Credentials, start time.Time) ProbeResult {
	endpoint := cred.BaseURL + ilinkGetUpdates
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader([]byte(`{}`)))
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.BaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cred.Token)
	res, err := c.httpClient().Do(req)
	if err != nil {
		return ProbeResult{OK: false, Domain: cred.BaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return ProbeResult{OK: false, Domain: cred.BaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: fmt.Sprintf("status %d body=%s", res.StatusCode, truncate(body, 128))}
	}
	var out struct {
		Ret       int    `json:"ret"`
		Errmsg    string `json:"errmsg"`
		AccountID string `json:"accountId"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Ret != 0 {
		return ProbeResult{OK: false, Domain: cred.BaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: fmt.Sprintf("ret=%d errmsg=%s", out.Ret, out.Errmsg)}
	}
	return ProbeResult{OK: true, Mode: ModePersonal, Domain: cred.BaseURL, AccountID: out.AccountID, LatencyMs: time.Since(start).Milliseconds()}
}

func domainFor(cred Credentials) string {
	if cred.BaseURL != "" {
		return cred.BaseURL
	}
	return cred.APIBaseURL
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}

// SendText posts a text message through the appropriate transport.
//
// For ilink: POST {baseUrl}/ilink/bot/sendmsg with {token, to, content, ctx}.
// For OA: POST {apiBaseUrl}/cgi-bin/message/custom/send.
//
// `contextToken` is an ilink-specific opaque token that ties replies to a
// fetch loop; for OA it is ignored.
func (c *Client) SendText(ctx context.Context, cred Credentials, toUser, content, contextToken string, _ string) error {
	cred = cred.Normalize()
	toUser = strings.TrimSpace(toUser)
	content = strings.TrimSpace(content)
	if toUser == "" || content == "" {
		return fmt.Errorf("touser and content are required")
	}
	switch cred.EffectiveMode() {
	case ModePersonal:
		return c.sendPersonal(ctx, cred, toUser, content, contextToken)
	case ModeOfficial:
		_, err := c.sendOfficial(ctx, cred, toUser, content)
		return err
	}
	return fmt.Errorf("unknown mode")
}

func (c *Client) sendPersonal(ctx context.Context, cred Credentials, toUser, content, contextToken string) error {
	endpoint := cred.BaseURL + ilinkSendMsg
	payload, _ := json.Marshal(map[string]any{
		"token":   cred.Token,
		"to":      toUser,
		"content": content,
		"ctx":     contextToken,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cred.Token)
	res, err := c.httpClient().Do(req)
	if err != nil {
		return fmt.Errorf("weixin send: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return fmt.Errorf("weixin send status=%d body=%s", res.StatusCode, truncate(body, 128))
	}
	var out struct {
		Ret    int    `json:"ret"`
		Errmsg string `json:"errmsg"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Ret != 0 {
		return fmt.Errorf("weixin send ret=%d errmsg=%s", out.Ret, out.Errmsg)
	}
	return nil
}

// --- Official Account (公众号) ---

func (c *Client) probeOfficial(ctx context.Context, cred Credentials, start time.Time) ProbeResult {
	if _, err := c.AccessToken(ctx, cred); err != nil {
		return ProbeResult{OK: false, Mode: ModeOfficial, Domain: cred.APIBaseURL, LatencyMs: time.Since(start).Milliseconds(), ErrorMessage: err.Error()}
	}
	return ProbeResult{OK: true, Mode: ModeOfficial, Domain: cred.APIBaseURL, AccountID: cred.AppID, LatencyMs: time.Since(start).Milliseconds()}
}

// AccessToken fetches (and caches) the OA access_token.
func (c *Client) AccessToken(ctx context.Context, cred Credentials) (string, error) {
	cred = cred.Normalize()
	if cred.AppID == "" || cred.AppSecret == "" {
		return "", fmt.Errorf("app_id and app_secret required")
	}
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()
	if c.token != "" && time.Until(c.tokenExp) > 5*time.Minute {
		return c.token, nil
	}
	u, _ := url.Parse(cred.APIBaseURL + "/cgi-bin/token")
	q := u.Query()
	q.Set("grant_type", "client_credential")
	q.Set("appid", cred.AppID)
	q.Set("secret", cred.AppSecret)
	u.RawQuery = q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	res, err := c.httpClient().Do(req)
	if err != nil {
		return "", fmt.Errorf("weixin token: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("weixin token decode: %w", err)
	}
	if out.ErrCode != 0 || out.AccessToken == "" {
		return "", fmt.Errorf("weixin token errcode=%d errmsg=%s", out.ErrCode, out.ErrMsg)
	}
	c.token = out.AccessToken
	c.tokenExp = time.Now().Add(time.Duration(out.ExpiresIn) * time.Second)
	return c.token, nil
}

func (c *Client) sendOfficial(ctx context.Context, cred Credentials, toUser, content string) (string, error) {
	token, err := c.AccessToken(ctx, cred)
	if err != nil {
		return "", err
	}
	payload, _ := json.Marshal(map[string]any{
		"touser":  toUser,
		"msgtype": "text",
		"text":    map[string]string{"content": content},
	})
	u, _ := url.Parse(cred.APIBaseURL + "/cgi-bin/message/custom/send")
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
		return "", fmt.Errorf("weixin send: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var out struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	_ = json.Unmarshal(body, &out)
	if out.ErrCode != 0 {
		return "", fmt.Errorf("weixin send errcode=%d errmsg=%s", out.ErrCode, out.ErrMsg)
	}
	return "", nil
}

// --- OA callback crypto (微信公众号消息加解密) ---

// DecodeAESKey converts the 43-char EncodingAESKey to a 32-byte AES key.
func DecodeAESKey(encodingAESKey string) ([]byte, error) {
	encodingAESKey = strings.TrimSpace(encodingAESKey)
	if len(encodingAESKey) != 43 {
		return nil, fmt.Errorf("EncodingAESKey must be 43 characters, got %d", len(encodingAESKey))
	}
	return base64.StdEncoding.DecodeString(encodingAESKey + "=")
}

// VerifySignature verifies the WeChat OA msg_signature scheme:
//   SHA1(sort([token, timestamp, nonce, encrypt]).join("")) == msg_signature
func VerifySignature(token, timestamp, nonce, encrypt, expected string) bool {
	parts := []string{token, timestamp, nonce, encrypt}
	sort.Strings(parts)
	h := sha1.New()
	_, _ = h.Write([]byte(strings.Join(parts, "")))
	got := fmt.Sprintf("%x", h.Sum(nil))
	return strings.EqualFold(got, strings.TrimSpace(expected))
}

// DecryptCallback decrypts the AES-CBC ciphertext; returns the plaintext XML
// and the trailing appID binding (which the platform may verify).
func DecryptCallback(aesKey []byte, cipherBase64 string) (plain string, appID string, err error) {
	cipherData, err := base64.StdEncoding.DecodeString(strings.TrimSpace(cipherBase64))
	if err != nil {
		return "", "", fmt.Errorf("base64: %w", err)
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", "", err
	}
	if len(cipherData) == 0 || len(cipherData)%block.BlockSize() != 0 {
		return "", "", fmt.Errorf("ciphertext length %d not AES block aligned", len(cipherData))
	}
	iv := make([]byte, aes.BlockSize)
	copy(iv, aesKey[:aes.BlockSize])
	mode := cipher.NewCBCDecrypter(block, iv)
	plainData := make([]byte, len(cipherData))
	mode.CryptBlocks(plainData, cipherData)
	n := int(plainData[len(plainData)-1])
	if n <= 0 || n > aes.BlockSize {
		return "", "", fmt.Errorf("invalid PKCS#7 padding")
	}
	for i := 0; i < n; i++ {
		if plainData[len(plainData)-1-i] != byte(n) {
			return "", "", fmt.Errorf("invalid PKCS#7 padding tail")
		}
	}
	plainData = plainData[:len(plainData)-n]
	if len(plainData) < 20 {
		return "", "", fmt.Errorf("plaintext too short")
	}
	msgLen := int(uint32(plainData[16])<<24 | uint32(plainData[17])<<16 | uint32(plainData[18])<<8 | uint32(plainData[19]))
	if msgLen <= 0 || 20+msgLen > len(plainData) {
		return "", "", fmt.Errorf("msg_len out of range")
	}
	return string(plainData[20 : 20+msgLen]), string(plainData[20+msgLen:]), nil
}

// EncryptCallback encrypts a reply per the WeChat OA scheme.
func EncryptCallback(aesKey []byte, plain, appID string) (string, error) {
	header := make([]byte, 16)
	if _, err := rand.Read(header); err != nil {
		return "", err
	}
	msgLen := len(plain)
	buf := make([]byte, 20+msgLen+len(appID))
	copy(buf[:16], header)
	buf[16] = byte(msgLen >> 24)
	buf[17] = byte(msgLen >> 16)
	buf[18] = byte(msgLen >> 8)
	buf[19] = byte(msgLen)
	copy(buf[20:], plain)
	copy(buf[20+msgLen:], appID)
	padLen := aes.BlockSize - len(buf)%aes.BlockSize
	pad := bytes.Repeat([]byte{byte(padLen)}, padLen)
	buf = append(buf, pad...)
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		return "", err
	}
	iv := make([]byte, aes.BlockSize)
	copy(iv, aesKey[:aes.BlockSize])
	enc := cipher.NewCBCEncrypter(block, iv)
	out := make([]byte, len(buf))
	enc.CryptBlocks(out, buf)
	return base64.StdEncoding.EncodeToString(out), nil
}

// InboundMessage is the decrypted XML envelope for OA callbacks.
type InboundMessage struct {
	XMLName      xml.Name `xml:"xml"`
	ToUserName   string   `xml:"ToUserName"`
	FromUserName string   `xml:"FromUserName"`
	CreateTime   int64    `xml:"CreateTime"`
	MsgType      string   `xml:"MsgType"`
	Content      string   `xml:"Content"`
	MsgId        int64    `xml:"MsgId"`
	Event        string   `xml:"Event"`
	EventKey     string   `xml:"EventKey"`
}

// ParseEncryptedCallback verifies + decrypts an inbound callback.
func ParseEncryptedCallback(cred Credentials, msgSignature, timestamp, nonce string, body []byte) (*InboundMessage, error) {
	cred = cred.Normalize()
	if !cred.HasCallback() {
		return nil, fmt.Errorf("token and encoding_aes_key required")
	}
	aesKey, err := DecodeAESKey(cred.EncodingAESKey)
	if err != nil {
		return nil, err
	}
	var env struct {
		XMLName    xml.Name `xml:"xml"`
		ToUserName string   `xml:"ToUserName"`
		Encrypt    string   `xml:"Encrypt"`
	}
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("xml: %w", err)
	}
	if !VerifySignature(cred.CallbackToken, timestamp, nonce, env.Encrypt, msgSignature) {
		return nil, fmt.Errorf("signature mismatch")
	}
	plain, _, err := DecryptCallback(aesKey, env.Encrypt)
	if err != nil {
		return nil, err
	}
	var msg InboundMessage
	if err := xml.Unmarshal([]byte(plain), &msg); err != nil {
		return nil, fmt.Errorf("decrypted xml: %w", err)
	}
	return &msg, nil
}

// ReplyText builds the XML response for an OA customer text reply.
func ReplyText(cred Credentials, toUser, fromUser string, text string, timestamp, nonce string) (string, error) {
	cred = cred.Normalize()
	if !cred.HasCallback() {
		return "", fmt.Errorf("token and encoding_aes_key required")
	}
	aesKey, err := DecodeAESKey(cred.EncodingAESKey)
	if err != nil {
		return "", err
	}
	body := fmt.Sprintf(`<xml><ToUserName><![CDATA[%s]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName><CreateTime>%d</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[%s]]></Content></xml>`, toUser, fromUser, time.Now().Unix(), text)
	cipherB64, err := EncryptCallback(aesKey, body, cred.AppID)
	if err != nil {
		return "", err
	}
	msgSig := func() string {
		parts := []string{cred.CallbackToken, timestamp, nonce, cipherB64}
		sort.Strings(parts)
		h := sha1.New()
		_, _ = h.Write([]byte(strings.Join(parts, "")))
		return fmt.Sprintf("%x", h.Sum(nil))
	}()
	return fmt.Sprintf(`<xml><Encrypt><![CDATA[%s]]></Encrypt><MsgSignature><![CDATA[%s]]></MsgSignature><TimeStamp>%s</TimeStamp><Nonce><![CDATA[%s]]></Nonce></xml>`, cipherB64, msgSig, timestamp, nonce), nil
}

// MaskAppID returns a non-reversible display form for an OA AppID.
func MaskAppID(id string) string {
	id = strings.TrimSpace(id)
	if len(id) <= 6 {
		return strings.Repeat("*", len(id))
	}
	return id[:4] + strings.Repeat("*", len(id)-8) + id[len(id)-4:]
}