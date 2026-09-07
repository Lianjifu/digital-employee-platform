package weixin

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func newResp(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

type fakeRT struct {
	calls   atomic.Int32
	handler func(req *http.Request) (*http.Response, error)
}

func (f *fakeRT) RoundTrip(req *http.Request) (*http.Response, error) {
	f.calls.Add(1)
	return f.handler(req)
}

// --- Credentials / mode detection ---

func TestCredentialsNormalizeAndMode(t *testing.T) {
	c := Credentials{Token: "  tok  ", BaseURL: "https://sidecar.example/"}
	c = c.Normalize()
	if c.Token != "tok" || c.BaseURL != "https://sidecar.example" {
		t.Fatalf("trim: %+v", c)
	}
	if c.EffectiveMode() != ModePersonal {
		t.Fatalf("mode: %s", c.EffectiveMode())
	}
	if !c.Valid() {
		t.Fatal("should be valid")
	}
	c2 := Credentials{AppID: "wxid", AppSecret: "s"}.Normalize()
	if c2.EffectiveMode() != ModeOfficial {
		t.Fatalf("mode: %s", c2.EffectiveMode())
	}
	if !c2.Valid() {
		t.Fatal("should be valid")
	}
}

func TestCredentialsInvalid(t *testing.T) {
	if (Credentials{}).Valid() {
		t.Fatal("empty creds should be invalid")
	}
	if (Credentials{Token: "x"}).Valid() {
		t.Fatal("missing baseUrl should be invalid")
	}
	if (Credentials{AppID: "x"}).Valid() {
		t.Fatal("missing appSecret should be invalid")
	}
}

func TestParseCredentials(t *testing.T) {
	s := `{"token":"ilink-tok","baseUrl":"https://x.example/"}`
	c, err := ParseCredentials(s)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if c.Token != "ilink-tok" || c.BaseURL != "https://x.example" {
		t.Fatalf("round: %+v", c)
	}
	if _, err := ParseCredentials(""); err == nil {
		t.Fatal("empty should fail")
	}
	if _, err := ParseCredentials("not-json"); err == nil {
		t.Fatal("garbage should fail")
	}
}

func TestMaskToken(t *testing.T) {
	if got := MaskToken("abcdef123456"); got != "abc******456" {
		t.Fatalf("mask: %s", got)
	}
	if got := MaskToken("xy"); got != "**" {
		t.Fatalf("short: %s", got)
	}
	if got := MaskToken(""); got != "" {
		t.Fatalf("empty: %s", got)
	}
}

func TestHasCallbackRequiresExact43(t *testing.T) {
	c := Credentials{CallbackToken: "t", EncodingAESKey: strings.Repeat("a", 42)}
	if c.HasCallback() {
		t.Fatal("42 chars should fail")
	}
	c2 := Credentials{CallbackToken: "t"}
	if c2.HasCallback() {
		t.Fatal("no key should fail")
	}
	c3 := Credentials{CallbackToken: "t", EncodingAESKey: strings.Repeat("a", 43)}
	if !c3.HasCallback() {
		t.Fatal("43 + token should pass")
	}
}

// --- Personal WeChat (ilink) probe + send ---

func TestProbePersonalOK(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		if req.Method != http.MethodPost || !strings.HasSuffix(req.URL.Path, "/ilink/bot/getupdates") {
			return nil, fmt.Errorf("unexpected %s %s", req.Method, req.URL.Path)
		}
		if req.Header.Get("Authorization") != "Bearer ilink-tok" {
			t.Errorf("auth: %s", req.Header.Get("Authorization"))
		}
		body, _ := io.ReadAll(req.Body)
		if string(body) != "{}" {
			t.Errorf("body: %s", body)
		}
		return newResp(200, `{"ret":0,"msgs":[],"accountId":"wx_real"}`), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	res := c.Probe(context.Background(), Credentials{Token: "ilink-tok", BaseURL: "https://sidecar.example"})
	if !res.OK {
		t.Fatalf("probe failed: %+v", res)
	}
	if res.Mode != ModePersonal || res.AccountID != "wx_real" || res.Domain != "https://sidecar.example" {
		t.Fatalf("result: %+v", res)
	}
}

func TestProbePersonalFail(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		return newResp(500, "boom"), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	res := c.Probe(context.Background(), Credentials{Token: "tok", BaseURL: "https://x.example"})
	if res.OK {
		t.Fatalf("expected fail: %+v", res)
	}
	if !strings.Contains(res.ErrorMessage, "status 500") {
		t.Fatalf("detail: %s", res.ErrorMessage)
	}
}

func TestProbePersonalInvalidCreds(t *testing.T) {
	c := NewClient()
	res := c.Probe(context.Background(), Credentials{Token: "tok"})
	if res.OK {
		t.Fatalf("expected fail: %+v", res)
	}
}

func TestSendTextPersonal(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(req.URL.Path, "/ilink/bot/sendmsg") {
			return nil, fmt.Errorf("unexpected %s", req.URL.Path)
		}
		body, _ := io.ReadAll(req.Body)
		var got map[string]any
		_ = json.Unmarshal(body, &got)
		if got["token"] != "ilink-tok" || got["to"] != "u1" || got["content"] != "hello" || got["ctx"] != "ctx42" {
			t.Errorf("payload: %+v", got)
		}
		return newResp(200, `{"ret":0,"msgs":[]}`), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	cred := Credentials{Token: "ilink-tok", BaseURL: "https://sidecar.example"}
	if err := c.SendText(context.Background(), cred, "u1", "hello", "ctx42", ""); err != nil {
		t.Fatalf("send: %v", err)
	}
}

func TestSendTextEmpty(t *testing.T) {
	c := NewClient()
	if err := c.SendText(context.Background(), Credentials{Token: "t", BaseURL: "https://x"}, "", "hi", "", ""); err == nil {
		t.Fatal("empty touser should fail")
	}
	if err := c.SendText(context.Background(), Credentials{Token: "t", BaseURL: "https://x"}, "u", "  ", "", ""); err == nil {
		t.Fatal("empty content should fail")
	}
}

func TestSendTextPersonalFail(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		return newResp(200, `{"ret":-1,"errmsg":"rate limited"}`), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	err := c.SendText(context.Background(), Credentials{Token: "t", BaseURL: "https://x"}, "u", "hi", "", "")
	if err == nil || !strings.Contains(err.Error(), "rate limited") {
		t.Fatalf("err: %v", err)
	}
}

// --- Official Account (公众号) ---

func TestAccessTokenOfficialCached(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		if !strings.Contains(req.URL.Path, "/cgi-bin/token") {
			return nil, fmt.Errorf("unexpected %s", req.URL.Path)
		}
		return newResp(200, `{"access_token":"AT","expires_in":7200}`), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	cred := Credentials{AppID: "wxid", AppSecret: "s"}
	tok, err := c.AccessToken(context.Background(), cred)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	if tok != "AT" {
		t.Fatalf("token: %s", tok)
	}
	tok2, _ := c.AccessToken(context.Background(), cred)
	if tok2 != "AT" || rt.calls.Load() != 1 {
		t.Fatalf("cache miss: tok=%s calls=%d", tok2, rt.calls.Load())
	}
}

func TestSendTextOfficial(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		switch {
		case strings.Contains(req.URL.Path, "/cgi-bin/token"):
			return newResp(200, `{"access_token":"AT","expires_in":7200}`), nil
		case strings.Contains(req.URL.Path, "/cgi-bin/message/custom/send"):
			body, _ := io.ReadAll(req.Body)
			if !strings.Contains(string(body), `"touser":"u1"`) {
				t.Errorf("missing touser: %s", body)
			}
			return newResp(200, `{"errcode":0,"errmsg":"ok"}`), nil
		default:
			return nil, fmt.Errorf("unexpected %s", req.URL.Path)
		}
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	cred := Credentials{AppID: "wxid", AppSecret: "s"}
	if err := c.SendText(context.Background(), cred, "u1", "hello", "", ""); err != nil {
		t.Fatalf("send: %v", err)
	}
}

func TestProbeOfficial(t *testing.T) {
	rt := &fakeRT{}
	rt.handler = func(req *http.Request) (*http.Response, error) {
		return newResp(200, `{"access_token":"AT","expires_in":7200}`), nil
	}
	c := &Client{HTTP: &http.Client{Transport: rt}}
	res := c.Probe(context.Background(), Credentials{AppID: "wxid", AppSecret: "s"})
	if !res.OK {
		t.Fatalf("probe failed: %+v", res)
	}
	if res.Mode != ModeOfficial {
		t.Fatalf("mode: %s", res.Mode)
	}
}

// --- OA callback crypto (sha1 + AES-CBC) ---

// sha1SortedHex mirrors the WeChat OA scheme: SHA1(sort([...]).join("")).
func sha1SortedHex(parts ...string) string {
	sorted := append([]string(nil), parts...)
	sort.Strings(sorted)
	h := sha1.New()
	_, _ = h.Write([]byte(strings.Join(sorted, "")))
	return hex.EncodeToString(h.Sum(nil))
}

func TestVerifySignature(t *testing.T) {
	sig := sha1SortedHex("wxt", "1700000000", "abc", "enc")
	if !VerifySignature("wxt", "1700000000", "abc", "enc", sig) {
		t.Fatal("should verify against own signature")
	}
	if VerifySignature("wxt", "1700000000", "abc", "enc", "deadbeef") {
		t.Fatal("should reject wrong sig")
	}
}

func TestAESRoundtrip(t *testing.T) {
	aesKey := bytes.Repeat([]byte{0xAA}, 32)
	plain := "hello 微信公众号 world"
	appID := "wxid_test"
	cipherB64, err := EncryptCallback(aesKey, plain, appID)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	got, gotApp, err := DecryptCallback(aesKey, cipherB64)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if got != plain {
		t.Fatalf("plain mismatch: %q vs %q", got, plain)
	}
	if gotApp != appID {
		t.Fatalf("appID mismatch: %q", gotApp)
	}
}

func TestDecodeAESKeyWrongLength(t *testing.T) {
	if _, err := DecodeAESKey("short"); err == nil {
		t.Fatal("expected length error")
	}
}

func TestParseEncryptedCallback(t *testing.T) {
	aesKey := []byte("0123456789abcdef0123456789abcdef")
	cred := Credentials{
		AppID:          "wxid_test",
		AppSecret:      "s",
		CallbackToken:  "wxtoken",
		EncodingAESKey: aesKeyB64(aesKey),
	}
	innerXML := `<xml><ToUserName><![CDATA[gh_test]]></ToUserName><FromUserName><![CDATA[ou_user]]></FromUserName><CreateTime>1700000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[hi there]]></Content><MsgId>9876543210</MsgId></xml>`
	encB64, err := EncryptCallback(aesKey, innerXML, cred.AppID)
	if err != nil {
		t.Fatalf("encrypt: %v", err)
	}
	envelope := []byte(fmt.Sprintf(`<xml><ToUserName><![CDATA[gh_test]]></ToUserName><Encrypt><![CDATA[%s]]></Encrypt></xml>`, encB64))
	sig := sha1SortedHex(cred.CallbackToken, "1700000000", "abc", encB64)
	msg, err := ParseEncryptedCallback(cred, sig, "1700000000", "abc", envelope)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if msg.FromUserName != "ou_user" || msg.MsgType != "text" || msg.Content != "hi there" {
		t.Fatalf("decoded: %+v", msg)
	}
	if _, err := ParseEncryptedCallback(cred, "bad", "1700000000", "abc", envelope); err == nil {
		t.Fatal("expected signature mismatch")
	}
}

func TestReplyTextSigned(t *testing.T) {
	aesKey := []byte("0123456789abcdef0123456789abcdef")
	cred := Credentials{
		AppID:          "wxid_test",
		AppSecret:      "s",
		CallbackToken:  "wxtoken",
		EncodingAESKey: aesKeyB64(aesKey),
	}
	resp, err := ReplyText(cred, "ou_user", "gh_test", "auto reply", "1700000000", "abc")
	if err != nil {
		t.Fatalf("reply: %v", err)
	}
	var env struct {
		Encrypt      string `xml:"Encrypt"`
		MsgSignature string `xml:"MsgSignature"`
		TimeStamp    string `xml:"TimeStamp"`
		Nonce        string `xml:"Nonce"`
	}
	if err := xml.Unmarshal([]byte(resp), &env); err != nil {
		t.Fatalf("parse reply: %v", err)
	}
	plain, appID, err := DecryptCallback(aesKey, env.Encrypt)
	if err != nil {
		t.Fatalf("decrypt reply: %v", err)
	}
	if appID != cred.AppID {
		t.Fatalf("appID: %s", appID)
	}
	if !strings.Contains(plain, "auto reply") {
		t.Fatalf("plain missing content: %s", plain)
	}
	wantSig := sha1SortedHex(cred.CallbackToken, "1700000000", "abc", env.Encrypt)
	if env.MsgSignature != wantSig {
		t.Fatalf("signature mismatch: %s vs %s", env.MsgSignature, wantSig)
	}
}

func TestMaskAppID(t *testing.T) {
	if got := MaskAppID("wx1234567890abcd"); len(got) < len("wx12****") {
		t.Fatalf("mask too short: %s", got)
	}
	if got := MaskAppID("xy"); got != "**" {
		t.Fatalf("short mask: %s", got)
	}
	if got := MaskAppID(""); got != "" {
		t.Fatalf("empty mask: %s", got)
	}
}

func aesKeyB64(key []byte) string {
	enc := base64.StdEncoding.EncodeToString(key)
	return enc[:len(enc)-1]
}

var _ = time.Now