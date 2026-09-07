package channel

import (
	"context"
	"errors"
	"testing"
)

func TestParseKind(t *testing.T) {
	cases := map[string]Kind{
		"feishu":    KindFeishu,
		"LARK":      KindFeishu,
		"wecom":     KindWecom,
		"wxwork":    KindWecom,
		"dingtalk":  KindDingtalk,
		"DT":        KindDingtalk,
		"weixin":    KindWeixin,
		"WX":        KindWeixin,
		"unknown":   "",
	}
	for in, want := range cases {
		if got := ParseKind(in); got != want {
			t.Fatalf("ParseKind(%q)=%q, want %q", in, got, want)
		}
	}
}

func TestRegistryRegisterAndFor(t *testing.T) {
	r := NewRegistry()
	a := NewMock(KindFeishu)
	r.Register(a)
	if r.For(KindFeishu) != a {
		t.Fatal("For should return registered adapter")
	}
	if r.For(KindWecom) != nil {
		t.Fatal("For should return nil for unregistered")
	}
}

func TestRegistryRegisterNil(t *testing.T) {
	r := NewRegistry()
	r.Register(nil)
	if len(r.Kinds()) != 0 {
		t.Fatal("register nil must be a no-op")
	}
}

func TestRegistrySendAndProbeDelegation(t *testing.T) {
	r := NewDefaultRegistry()
	id, err := r.SendText(context.Background(), KindFeishu, `{"appId":"x","appSecret":"y"}`, "u1", "hi")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if id == "" {
		t.Fatal("expected message id")
	}
	res := r.Probe(context.Background(), KindDingtalk, "{}")
	if !res.OK {
		t.Fatalf("probe must succeed by default: %+v", res)
	}
	if res.Channel != KindDingtalk {
		t.Fatalf("probe channel mismatch: %s", res.Channel)
	}
}

func TestRegistryUnknownKindErrors(t *testing.T) {
	r := NewRegistry()
	if _, err := r.SendText(context.Background(), KindFeishu, "{}", "u", "t"); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("expected ErrUnsupported, got %v", err)
	}
	if _, err := r.ParseInbound(KindFeishu, "{}", []byte("{}")); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("expected ErrUnsupported, got %v", err)
	}
}

func TestMockRecordsSendAndParse(t *testing.T) {
	m := NewMock(KindWecom)
	if m.Kind() != KindWecom {
		t.Fatalf("kind mismatch")
	}
	m.SetSend(false, "rate_limited")
	if _, err := m.SendText(context.Background(), "{}", "u1", "x"); err == nil {
		t.Fatal("expected error when send disabled")
	}
	m.SetSend(true, "")
	if _, err := m.SendText(context.Background(), "{}", "u1", "x"); err != nil {
		t.Fatalf("send should succeed after re-enable: %v", err)
	}
	// Both calls were recorded; the second succeeded.
	if len(m.Sent) != 2 {
		t.Fatalf("expected 2 Sent entries (1 fail + 1 success), got %d", len(m.Sent))
	}
	ev, err := m.ParseInbound("{}", []byte("hello"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if ev.Text != "hello" || ev.Channel != KindWecom {
		t.Fatalf("event=%+v", ev)
	}
}

func TestKindsSorted(t *testing.T) {
	r := NewRegistry()
	r.Register(NewMock(KindWeixin))
	r.Register(NewMock(KindFeishu))
	r.Register(NewMock(KindWecom))
	r.Register(NewMock(KindDingtalk))
	got := r.Kinds()
	want := []Kind{KindDingtalk, KindFeishu, KindWecom, KindWeixin}
	for i, k := range got {
		if k != want[i] {
			t.Fatalf("kinds[%d]=%s, want %s", i, k, want[i])
		}
	}
}

func TestVerifyRecordsCalls(t *testing.T) {
	m := NewMock(KindFeishu)
	if err := m.Verify("{}", map[string]string{"X-Sig": "abc"}, []byte("body")); err != nil {
		t.Fatal(err)
	}
	if m.VerifyCalls != 1 {
		t.Fatalf("VerifyCalls=%d", m.VerifyCalls)
	}
}
