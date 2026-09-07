// Package channel defines the unified messaging-channel Adapter surface for
// the four supported channels (feishu / wecom / dingtalk / weixin).
//
// Each vendor (Feishu, WeCom, DingTalk, Weixin) ships its own Client with a
// bespoke credential type + payload shape. The Adapter normalizes the
// operations the platform actually needs:
//
//   - Kind         → which channel
//   - Probe        → health + credential validity
//   - SendText     → post a plain text message
//   - Verify       → verify inbound webhook signature
//   - ParseInbound → turn the raw vendor payload into a Canonical InboundEvent
//
// The package exposes a thin Registry that maps a ChannelKind to its adapter
// so server.SessionRouting can deliver a single normalized payload across
// all four channels without per-vendor conditionals.
package channel

import (
	"context"
	"errors"
	"time"
)

// Kind enumerates supported channels.
type Kind string

const (
	KindFeishu   Kind = "feishu"
	KindWecom    Kind = "wecom"
	KindDingtalk Kind = "dingtalk"
	KindWeixin   Kind = "weixin"
)

// AllKinds is the complete vendor set in stable order.
var AllKinds = []Kind{KindFeishu, KindWecom, KindDingtalk, KindWeixin}

// ParseKind normalizes a free-form channel string to Kind. Unknown values
// return "" so the caller can produce a 400.
func ParseKind(s string) Kind {
	switch s {
	case "feishu", "FEISHU", "lark", "LARK":
		return KindFeishu
	case "wecom", "WECOM", "wechat_work", "wxwork", "WXWORK":
		return KindWecom
	case "dingtalk", "DINGTALK", "dt", "DT":
		return KindDingtalk
	case "weixin", "WEIXIN", "wechat", "WX", "wx":
		return KindWeixin
	}
	return ""
}

// ProbeResult summarizes a health probe.
type ProbeResult struct {
	OK         bool      `json:"ok"`
	Channel    Kind      `json:"channel"`
	BotName    string    `json:"botName,omitempty"`
	Detail     string    `json:"detail,omitempty"`
	ProbedAt   time.Time `json:"probedAt"`
	LatencyMs  int64     `json:"latencyMs"`
}

// InboundEvent is the normalized shape produced by every channel's
// ParseInbound. Server-side session routing consumes this directly.
type InboundEvent struct {
	Channel       Kind      `json:"channel"`
	WorkspaceID   string    `json:"workspaceId,omitempty"`
	MessageID     string    `json:"messageId"`
	SenderID      string    `json:"senderId"`
	SenderName    string    `json:"senderName,omitempty"`
	ChatID        string    `json:"chatId"`
	ChatType      string    `json:"chatType,omitempty"` // direct | group
	Text          string    `json:"text"`
	Raw           []byte    `json:"-"`
	ReceivedAt    time.Time `json:"receivedAt"`
	SessionWebhhook string  `json:"sessionWebhook,omitempty"` // DingTalk only
}

// Adapter is the unified surface every channel must implement.
type Adapter interface {
	Kind() Kind
	Probe(ctx context.Context, credJSON string) ProbeResult
	SendText(ctx context.Context, credJSON, toUserID, text string) (messageID string, err error)
	// Verify parses + verifies an inbound webhook signature.
	Verify(credJSON string, headers map[string]string, body []byte) error
	// ParseInbound turns a verified webhook payload into a normalized event.
	ParseInbound(credJSON string, body []byte) (InboundEvent, error)
}

// ErrUnsupported is returned by an adapter for an operation the channel does
// not implement (e.g. DingTalk webhooks that need a session webhook URL).
var ErrUnsupported = errors.New("channel: operation unsupported")

// ErrInvalidCredentials is returned when the stored credential blob is
// malformed (parse failed or required fields missing).
var ErrInvalidCredentials = errors.New("channel: invalid credentials")

// ErrSignatureInvalid is returned when Verify rejects an inbound webhook.
var ErrSignatureInvalid = errors.New("channel: signature invalid")
