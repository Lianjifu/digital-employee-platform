package feishu

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"testing"
)

func TestDecryptAndParseURLVerification(t *testing.T) {
	key := "test_encrypt_key"
	plain := `{"challenge":"chal-1","token":"vt-1","type":"url_verification"}`
	enc, err := encryptForTest(key, plain)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]string{"encrypt": enc})
	env, _, msg, err := ParseAndNormalize(body, Credentials{EncryptKey: key, VerificationToken: "vt-1", AppID: "a", AppSecret: "b"})
	if err != nil {
		t.Fatal(err)
	}
	if env.Type != "url_verification" || env.Challenge != "chal-1" {
		t.Fatalf("%+v", env)
	}
	if msg != nil {
		t.Fatalf("expected no message")
	}
}

func TestParseMessageReceive(t *testing.T) {
	raw := []byte(`{
	  "schema":"2.0",
	  "header":{"event_id":"ev1","event_type":"im.message.receive_v1","token":"vt"},
	  "event":{
	    "sender":{"sender_type":"user","sender_id":{"open_id":"ou_user"}},
	    "message":{"chat_id":"oc_chat","chat_type":"group","message_id":"om_1","message_type":"text","content":"{\"text\":\"你好\"}"}
	  }
	}`)
	_, _, msg, err := ParseAndNormalize(raw, Credentials{VerificationToken: "vt", AppID: "a", AppSecret: "b"})
	if err != nil {
		t.Fatal(err)
	}
	if msg == nil || msg.Text != "你好" || msg.ChatID != "oc_chat" || msg.SenderOpenID != "ou_user" {
		t.Fatalf("%+v", msg)
	}
}

func TestVerifySignature(t *testing.T) {
	body := []byte(`{"hello":1}`)
	ts, nonce, key := "123", "n1", "ek"
	h := sha256.New()
	_, _ = h.Write([]byte(ts + nonce + key))
	_, _ = h.Write(body)
	sig := hex.EncodeToString(h.Sum(nil))
	if !VerifySignature(ts, nonce, key, body, sig) {
		t.Fatal("should match")
	}
}

func encryptForTest(encryptKey, plaintext string) (string, error) {
	sum := sha256.Sum256([]byte(encryptKey))
	key := sum[:]
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	pad := aes.BlockSize - len(plaintext)%aes.BlockSize
	padded := append([]byte(plaintext), bytesRepeat(byte(pad), pad)...)
	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	dst := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(dst, padded)
	return base64.StdEncoding.EncodeToString(append(iv, dst...)), nil
}

func bytesRepeat(b byte, n int) []byte {
	out := make([]byte, n)
	for i := range out {
		out[i] = b
	}
	return out
}
