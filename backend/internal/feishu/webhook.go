package feishu

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

// DecryptEvent decrypts Feishu AES-256-CBC encrypt payload (Encrypt Key strategy).
func DecryptEvent(encryptKey, cryptoText string) (string, error) {
	encryptKey = strings.TrimSpace(encryptKey)
	cryptoText = strings.TrimSpace(cryptoText)
	if encryptKey == "" || cryptoText == "" {
		return "", fmt.Errorf("encrypt_key and ciphertext required")
	}
	sum := sha256.Sum256([]byte(encryptKey))
	key := sum[:]
	ciphertext, err := base64.StdEncoding.DecodeString(cryptoText)
	if err != nil {
		return "", fmt.Errorf("base64: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	if len(ciphertext) < aes.BlockSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	iv := ciphertext[:aes.BlockSize]
	ciphertext = ciphertext[aes.BlockSize:]
	if len(ciphertext)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext not multiple of block size")
	}
	stream := cipher.NewCBCDecrypter(block, iv)
	plain := make([]byte, len(ciphertext))
	stream.CryptBlocks(plain, ciphertext)
	plain, err = pkcs7Unpad(plain)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

func pkcs7Unpad(b []byte) ([]byte, error) {
	if len(b) == 0 {
		return nil, fmt.Errorf("empty plaintext")
	}
	n := int(b[len(b)-1])
	if n == 0 || n > len(b) || n > aes.BlockSize {
		return nil, fmt.Errorf("invalid pkcs7 padding")
	}
	for i := 0; i < n; i++ {
		if b[len(b)-1-i] != byte(n) {
			return nil, fmt.Errorf("invalid pkcs7 padding")
		}
	}
	return b[:len(b)-n], nil
}

// VerifySignature checks X-Lark-Signature when Encrypt Key is configured.
// s = sha256(timestamp + nonce + encrypt_key + body)
func VerifySignature(timestamp, nonce, encryptKey string, body []byte, signature string) bool {
	if strings.TrimSpace(signature) == "" || strings.TrimSpace(encryptKey) == "" {
		return false
	}
	h := sha256.New()
	_, _ = h.Write([]byte(timestamp + nonce + encryptKey))
	_, _ = h.Write(body)
	want := hex.EncodeToString(h.Sum(nil))
	return strings.EqualFold(want, strings.TrimSpace(signature))
}

// EventEnvelope is a flexible Feishu event / callback body (v1 + v2 + url_verification).
type EventEnvelope struct {
	Encrypt string          `json:"encrypt"`
	Type    string          `json:"type"` // url_verification | event_callback (v1)
	Token   string          `json:"token"`
	Challenge string        `json:"challenge"`
	Schema  string          `json:"schema"` // "2.0"
	Header  json.RawMessage `json:"header"`
	Event   json.RawMessage `json:"event"`
	UUID    string          `json:"uuid"`
}

// EventHeaderV2 is schema 2.0 header.
type EventHeaderV2 struct {
	EventID   string `json:"event_id"`
	EventType string `json:"event_type"`
	AppID     string `json:"app_id"`
	Token     string `json:"token"`
	CreateTime string `json:"create_time"`
}

// InboundMessage is a normalized im.message.receive_v1 payload for the control plane.
type InboundMessage struct {
	EventID       string `json:"eventId"`
	EventType     string `json:"eventType"`
	ChatID        string `json:"chatId"`
	ChatType      string `json:"chatType"`
	MessageID     string `json:"messageId"`
	MessageType   string `json:"messageType"`
	Text          string `json:"text"`
	SenderOpenID  string `json:"senderOpenId"`
	SenderType    string `json:"senderType"`
	RawEventType  string `json:"rawEventType"`
}

// ParseAndNormalize unwraps encrypt / url_verification and extracts inbound message when present.
func ParseAndNormalize(raw []byte, cred Credentials) (env EventEnvelope, plain []byte, msg *InboundMessage, err error) {
	cred = cred.Normalize()
	plain = raw
	if err = json.Unmarshal(raw, &env); err != nil {
		return env, nil, nil, fmt.Errorf("invalid json: %w", err)
	}
	if env.Encrypt != "" {
		if cred.EncryptKey == "" {
			return env, nil, nil, fmt.Errorf("encrypted event but encrypt_key not configured")
		}
		dec, derr := DecryptEvent(cred.EncryptKey, env.Encrypt)
		if derr != nil {
			return env, nil, nil, derr
		}
		plain = []byte(dec)
		env = EventEnvelope{}
		if err = json.Unmarshal(plain, &env); err != nil {
			return env, plain, nil, fmt.Errorf("decrypt json: %w", err)
		}
	}
	if env.Type == "url_verification" || env.Challenge != "" && env.Type == "url_verification" {
		return env, plain, nil, nil
	}
	// token check when configured
	token := env.Token
	if token == "" && len(env.Header) > 0 {
		var h EventHeaderV2
		_ = json.Unmarshal(env.Header, &h)
		token = h.Token
	}
	if cred.VerificationToken != "" && token != "" && token != cred.VerificationToken {
		return env, plain, nil, fmt.Errorf("verification_token mismatch")
	}
	msg = normalizeMessage(env, plain)
	return env, plain, msg, nil
}

func normalizeMessage(env EventEnvelope, plain []byte) *InboundMessage {
	eventType := env.Type
	eventID := env.UUID
	if len(env.Header) > 0 {
		var h EventHeaderV2
		if json.Unmarshal(env.Header, &h) == nil {
			if h.EventType != "" {
				eventType = h.EventType
			}
			if h.EventID != "" {
				eventID = h.EventID
			}
		}
	}
	if eventType != "im.message.receive_v1" && !strings.Contains(string(plain), `"message"`) {
		return &InboundMessage{EventID: eventID, EventType: eventType, RawEventType: eventType}
	}

	// Flexible extract from event object
	var root map[string]any
	_ = json.Unmarshal(plain, &root)
	ev, _ := root["event"].(map[string]any)
	if ev == nil {
		return &InboundMessage{EventID: eventID, EventType: eventType, RawEventType: eventType}
	}
	msgObj, _ := ev["message"].(map[string]any)
	sender, _ := ev["sender"].(map[string]any)
	if msgObj == nil {
		return &InboundMessage{EventID: eventID, EventType: eventType, RawEventType: eventType}
	}
	out := &InboundMessage{
		EventID:      eventID,
		EventType:    coalesce(eventType, "im.message.receive_v1"),
		RawEventType: eventType,
		ChatID:       strAny(msgObj["chat_id"]),
		ChatType:     strAny(msgObj["chat_type"]),
		MessageID:    strAny(msgObj["message_id"]),
		MessageType:  strAny(msgObj["message_type"]),
	}
	if sender != nil {
		out.SenderType = strAny(sender["sender_type"])
		if id, ok := sender["sender_id"].(map[string]any); ok {
			out.SenderOpenID = strAny(id["open_id"])
		}
	}
	content := strAny(msgObj["content"])
	if out.MessageType == "text" && content != "" {
		var c struct {
			Text string `json:"text"`
		}
		if json.Unmarshal([]byte(content), &c) == nil {
			out.Text = c.Text
		} else {
			out.Text = content
		}
	}
	return out
}

func strAny(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		return ""
	}
}
