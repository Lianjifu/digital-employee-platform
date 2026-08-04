package wecom

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"
)

func TestAccessTokenAndSend(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/cgi-bin/gettoken", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("corpid") != "ww1" {
			t.Fatalf("corpid")
		}
		_, _ = w.Write([]byte(`{"errcode":0,"access_token":"tok-w","expires_in":7200}`))
	})
	mux.HandleFunc("/cgi-bin/message/send", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("access_token") != "tok-w" {
			t.Fatalf("token")
		}
		_, _ = w.Write([]byte(`{"errcode":0,"errmsg":"ok","msgid":"mid-1"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cli := NewClient()
	cli.HTTP = srv.Client()
	cred := Credentials{CorpID: "ww1", CorpSecret: "sec", AgentID: "1000002", APIBaseURL: srv.URL}.Normalize()
	probe := cli.Probe(context.Background(), cred)
	if !probe.OK {
		t.Fatal(probe.ErrorMessage)
	}
	id, err := cli.SendText(context.Background(), cred, "UserA", "hi")
	if err != nil || id != "mid-1" {
		t.Fatalf("%v %q", err, id)
	}
}

func TestVerifyURLAndParseCallback(t *testing.T) {
	aesKeyRaw := make([]byte, 32)
	_, _ = rand.Read(aesKeyRaw)
	encodingKey := strings.TrimRight(base64.StdEncoding.EncodeToString(aesKeyRaw), "=")
	if len(encodingKey) != 43 {
		// force 43 by padding/truncating encode
		for len(encodingKey) < 43 {
			encodingKey += "A"
		}
		encodingKey = encodingKey[:43]
		decoded, err := DecodeAESKey(encodingKey)
		if err != nil {
			t.Fatal(err)
		}
		aesKeyRaw = decoded
	} else {
		decoded, err := DecodeAESKey(encodingKey)
		if err != nil {
			t.Fatal(err)
		}
		aesKeyRaw = decoded
	}

	cred := Credentials{
		CorpID: "wwcorp", CorpSecret: "s", AgentID: "1",
		CallbackToken: "tok", CallbackAESKey: encodingKey,
	}.Normalize()

	echoPlain := "hello-echo"
	echoCipher := mustEncrypt(t, aesKeyRaw, echoPlain, "wwcorp")
	sig := sign(cred.CallbackToken, "1", "n", echoCipher)
	got, err := VerifyURLEcho(cred, sig, "1", "n", echoCipher)
	if err != nil || got != echoPlain {
		t.Fatalf("echo %v %q", err, got)
	}

	inner := `<xml><ToUserName><![CDATA[to]]></ToUserName><FromUserName><![CDATA[fromU]]></FromUserName><CreateTime>1</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好企微]]></Content><MsgId>99</MsgId><AgentID>1000002</AgentID></xml>`
	enc := mustEncrypt(t, aesKeyRaw, inner, "wwcorp")
	body := []byte(`<xml><Encrypt><![CDATA[` + enc + `]]></Encrypt></xml>`)
	msgSig := sign(cred.CallbackToken, "2", "n2", enc)
	msg, err := ParseEncryptedCallback(cred, msgSig, "2", "n2", body)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Text != "你好企微" || msg.FromUserName != "fromU" {
		t.Fatalf("%+v", msg)
	}
}

func sign(token, ts, nonce, encrypt string) string {
	parts := []string{token, ts, nonce, encrypt}
	sort.Strings(parts)
	h := sha1.New()
	_, _ = h.Write([]byte(strings.Join(parts, "")))
	return fmt.Sprintf("%x", h.Sum(nil))
}

func mustEncrypt(t *testing.T, aesKey []byte, msg, corpID string) string {
	t.Helper()
	rand16 := make([]byte, 16)
	_, _ = rand.Read(rand16)
	buf := make([]byte, 0, 16+4+len(msg)+len(corpID))
	buf = append(buf, rand16...)
	lenBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBuf, uint32(len(msg)))
	buf = append(buf, lenBuf...)
	buf = append(buf, []byte(msg)...)
	buf = append(buf, []byte(corpID)...)
	pad := aes.BlockSize - len(buf)%aes.BlockSize
	for i := 0; i < pad; i++ {
		buf = append(buf, byte(pad))
	}
	block, err := aes.NewCipher(aesKey)
	if err != nil {
		t.Fatal(err)
	}
	mode := cipher.NewCBCEncrypter(block, aesKey[:16])
	out := make([]byte, len(buf))
	mode.CryptBlocks(out, buf)
	return base64.StdEncoding.EncodeToString(out)
}
