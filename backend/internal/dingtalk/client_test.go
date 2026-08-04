package dingtalk

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func TestAccessTokenAndSend(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1.0/oauth2/accessToken", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"accessToken":"tok-d","expireIn":7200}`))
	})
	mux.HandleFunc("/v1.0/robot/oToMessages/batchSend", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-acs-dingtalk-access-token") != "tok-d" {
			t.Fatalf("missing token header")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"processQueryKey":"pq-1"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cli := NewClient()
	cli.HTTP = srv.Client()
	cred := Credentials{ClientID: "ding_x", ClientSecret: "sec", Domain: srv.URL}.Normalize()
	probe := cli.Probe(context.Background(), cred)
	if !probe.OK {
		t.Fatalf("%s", probe.ErrorMessage)
	}
	id, err := cli.SendText(context.Background(), cred, "user1", "hello")
	if err != nil || id != "pq-1" {
		t.Fatalf("send %v %q", err, id)
	}
}

func TestVerifyRobotSign(t *testing.T) {
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	secret := "SEC123"
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(ts + "\n" + secret))
	sign := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if !VerifyRobotSign(ts, sign, secret) {
		t.Fatal("expected valid")
	}
	if VerifyRobotSign(ts, "bad", secret) {
		t.Fatal("expected invalid")
	}
}

func TestParseRobotCallback(t *testing.T) {
	raw := []byte(`{"msgId":"m1","conversationId":"c1","conversationType":"1","senderStaffId":"u1","senderNick":"张三","text":{"content":"你好"},"sessionWebhook":"https://oapi.dingtalk.com/x"}`)
	msg, err := ParseRobotCallback(raw)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Text != "你好" || msg.SenderID != "u1" {
		t.Fatalf("%+v", msg)
	}
}

func TestParseCredentialsShorthand(t *testing.T) {
	c, err := ParseCredentials("ding_a:secret_b")
	if err != nil || c.ClientID != "ding_a" || c.RobotCode != "ding_a" {
		t.Fatalf("%v %+v", err, c)
	}
}
