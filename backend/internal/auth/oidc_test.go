package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExchangeDevCodes(t *testing.T) {
	cfg := OIDCConfig{AllowDevCodes: true}
	id, err := cfg.ExchangeCode(context.Background(), "admin")
	if err != nil || id.Role != "admin" {
		t.Fatalf("admin: %v %#v", err, id)
	}
}

func TestExchangeRemoteTokenAndUserInfo(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("code") != "good-code" {
			http.Error(w, "bad", 400)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "at-1", "token_type": "Bearer"})
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer at-1" {
			http.Error(w, "unauth", 401)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sub": "u-oidc-1", "email": "admin@acme.com", "name": "OIDC Admin", "groups": []string{"admins"},
		})
	})
	ts := httptest.NewServer(mux)
	defer ts.Close()

	cfg := OIDCConfig{
		Enabled: true, Issuer: ts.URL, ClientID: "de", ClientSecret: "s",
		RedirectURL: "http://localhost/cb", HTTPClient: ts.Client(),
		TokenURL: ts.URL + "/token", UserInfoURL: ts.URL + "/userinfo",
	}
	id, err := cfg.ExchangeCode(context.Background(), "good-code")
	if err != nil {
		t.Fatal(err)
	}
	if id.ID != "u-oidc-1" || id.Role != "admin" {
		t.Fatalf("got %#v", id)
	}
}

func TestAuthURLRequiresState(t *testing.T) {
	cfg := OIDCConfig{Enabled: true, Issuer: "http://idp", ClientID: "c", RedirectURL: "http://cb"}
	if _, err := cfg.AuthURL(""); err == nil {
		t.Fatal("expected error")
	}
	u, err := cfg.AuthURL("abc")
	if err != nil || u == "" {
		t.Fatal(err)
	}
}
