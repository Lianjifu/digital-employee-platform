package weixin

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeAndSend(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/ilink/bot/getupdates", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok-wx" {
			http.Error(w, "unauth", 401)
			return
		}
		_, _ = w.Write([]byte(`{"ret":0,"msgs":[],"get_updates_buf":"b1"}`))
	})
	mux.HandleFunc("/ilink/bot/sendmessage", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ret":0}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	cli := NewClient()
	cli.HTTP = srv.Client()
	cred := Credentials{Token: "tok-wx", BaseURL: srv.URL}.Normalize()
	probe := cli.Probe(context.Background(), cred)
	if !probe.OK {
		t.Fatal(probe.ErrorMessage)
	}
	if err := cli.SendText(context.Background(), cred, "u@im.wechat", "hi", "ctx-1", "c1"); err != nil {
		t.Fatal(err)
	}
	if err := cli.SendText(context.Background(), cred, "u@im.wechat", "hi", "", ""); err == nil {
		t.Fatal("expected context_token error")
	}
}

func TestParseBareToken(t *testing.T) {
	c, err := ParseCredentials("plain-token")
	if err != nil || c.Token != "plain-token" {
		t.Fatalf("%v %+v", err, c)
	}
}
