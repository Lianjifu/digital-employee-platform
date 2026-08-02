package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"
)

func TestMintVerifyRunToken(t *testing.T) {
	t.Setenv("DE_SKILL_RUN_SECRET", "test-secret")
	tok := MintRunToken("sk1", "w1", "u1", time.Minute)
	claims, err := VerifyRunToken(tok)
	if err != nil {
		t.Fatal(err)
	}
	if claims.SkillID != "sk1" || claims.WorkspaceID != "w1" || claims.ActorID != "u1" {
		t.Fatalf("%+v", claims)
	}
	if _, err := VerifyRunToken(tok + "x"); err == nil {
		t.Fatal("expected bad sig")
	}
}

func TestVerifyRunTokenExpired(t *testing.T) {
	t.Setenv("DE_SKILL_RUN_SECRET", "test-secret")
	// Craft expired claims (MintRunToken coerces non-positive TTL to 5m).
	claims := RunTokenClaims{SkillID: "sk1", WorkspaceID: "w1", ActorID: "u1", Exp: time.Now().UTC().Add(-time.Minute).Unix()}
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte("test-secret"))
	mac.Write([]byte(payload))
	tok := "v1." + payload + "." + hex.EncodeToString(mac.Sum(nil))
	if _, err := VerifyRunToken(tok); err == nil {
		t.Fatal("expected expired")
	}
}
