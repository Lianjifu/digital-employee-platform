package feishu

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseCredentialsJSONAndShorthand(t *testing.T) {
	c, err := ParseCredentials(`{"app_id":"cli_a","app_secret":"sec","domain":"https://open.larksuite.com"}`)
	if err != nil {
		t.Fatal(err)
	}
	if c.AppID != "cli_a" || c.AppSecret != "sec" || c.Domain != LarkDomain {
		t.Fatalf("%+v", c)
	}
	c2, err := ParseCredentials("cli_x:secret_y")
	if err != nil || c2.AppID != "cli_x" || c2.AppSecret != "secret_y" || c2.Domain != DefaultDomain {
		t.Fatalf("%+v %v", c2, err)
	}
}

func TestProbeAndSend(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/open-apis/auth/v3/tenant_access_token/internal", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["app_id"] != "cli_test" || body["app_secret"] != "sec_test" {
			w.WriteHeader(400)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "tenant_access_token": "t-abc", "expire": 7200})
	})
	mux.HandleFunc("/open-apis/bot/v3/info", func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer t-abc") {
			w.WriteHeader(401)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"bot":  map[string]any{"open_id": "ou_bot", "app_name": "DE Bot"},
		})
	})
	mux.HandleFunc("/open-apis/im/v1/messages", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("receive_id_type") != "chat_id" {
			t.Fatalf("receive_id_type=%s", r.URL.Query().Get("receive_id_type"))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": map[string]any{"message_id": "om_1"}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cli := &Client{HTTP: srv.Client()}
	cred := Credentials{AppID: "cli_test", AppSecret: "sec_test", Domain: srv.URL}
	probe := cli.Probe(context.Background(), cred)
	if !probe.OK || probe.BotOpenID != "ou_bot" || probe.BotName != "DE Bot" {
		t.Fatalf("%+v", probe)
	}
	mid, err := cli.SendText(context.Background(), cred, "chat_id", "oc_chat", "hello")
	if err != nil || mid != "om_1" {
		t.Fatalf("send %q %v", mid, err)
	}
}

func TestProbeTokenFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/open-apis/auth/v3/tenant_access_token/internal", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"code": 10014, "msg": "app secret invalid"})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	cli := &Client{HTTP: srv.Client()}
	probe := cli.Probe(context.Background(), Credentials{AppID: "x", AppSecret: "y", Domain: srv.URL})
	if probe.OK || !strings.Contains(probe.ErrorMessage, "10014") {
		t.Fatalf("%+v", probe)
	}
}
