package vault

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// Client resolves credentialRef → secret material. Never logs plaintext.
type Client struct {
	addr   string
	token  string
	mount  string
	http   *http.Client
	mu     sync.RWMutex
	stub   map[string]string
}

func NewFromEnv() *Client {
	return &Client{
		addr:  strings.TrimSpace(os.Getenv("DE_VAULT_ADDR")),
		token: strings.TrimSpace(os.Getenv("DE_VAULT_TOKEN")),
		mount: envOr("DE_VAULT_KV_MOUNT", "secret"),
		http:  &http.Client{Timeout: 10 * time.Second},
		stub:  map[string]string{},
	}
}

func envOr(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}

func (c *Client) Enabled() bool {
	return c != nil && c.addr != ""
}

// PutStub stores a secret under ref for local Compose without real Vault.
func (c *Client) PutStub(ref, value string) {
	_ = c.Put(context.Background(), ref, value)
}

// Put writes secret to Vault KV v2 when configured; always mirrors into local stub for Resolve fallback.
func (c *Client) Put(ctx context.Context, ref, value string) error {
	if c == nil {
		return errors.New("vault client nil")
	}
	if ref == "" || value == "" {
		return errors.New("empty credentialRef or value")
	}
	path, err := c.kvPath(ref)
	if err != nil {
		return err
	}
	c.mu.Lock()
	if c.stub == nil {
		c.stub = map[string]string{}
	}
	c.stub[ref] = value
	c.mu.Unlock()

	if !c.Enabled() || c.token == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]any{"data": map[string]any{"value": value}})
	url := strings.TrimRight(c.addr, "/") + "/v1/" + c.mount + "/data/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("X-Vault-Token", c.token)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("vault put: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return fmt.Errorf("vault put %d: %s", res.StatusCode, string(raw))
	}
	return nil
}

// Resolve returns secret for credentialRef (stub first, then Vault KV v2).
func (c *Client) Resolve(ctx context.Context, ref string) (string, error) {
	if c == nil {
		return "", errors.New("vault client nil")
	}
	if ref == "" {
		return "", errors.New("empty credentialRef")
	}
	path, err := c.kvPath(ref)
	if err != nil {
		return "", err
	}

	c.mu.RLock()
	if v, ok := c.stub[ref]; ok {
		c.mu.RUnlock()
		return v, nil
	}
	c.mu.RUnlock()

	if !c.Enabled() {
		return "", errors.New("凭据未找到: " + ref)
	}
	if c.token == "" {
		return "", errors.New("DE_VAULT_TOKEN 未配置")
	}
	url := strings.TrimRight(c.addr, "/") + "/v1/" + c.mount + "/data/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Vault-Token", c.token)
	res, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("vault get: %w", err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode == http.StatusNotFound {
		return "", errors.New("凭据未找到: " + ref)
	}
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("vault get %d: %s", res.StatusCode, string(raw))
	}
	var wrap struct {
		Data struct {
			Data map[string]any `json:"data"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return "", err
	}
	if v, ok := wrap.Data.Data["value"].(string); ok && v != "" {
		c.mu.Lock()
		c.stub[ref] = v
		c.mu.Unlock()
		return v, nil
	}
	return "", errors.New("vault 密钥缺少 data.value: " + ref)
}

func (c *Client) kvPath(ref string) (string, error) {
	r := strings.TrimSpace(ref)
	switch {
	case strings.HasPrefix(r, "vault:secret/data/"):
		return strings.TrimPrefix(r, "vault:secret/data/"), nil
	case strings.HasPrefix(r, "vault:"):
		p := strings.TrimPrefix(r, "vault:")
		p = strings.TrimPrefix(p, "/")
		if strings.HasPrefix(p, "secret/data/") {
			return strings.TrimPrefix(p, "secret/data/"), nil
		}
		if strings.HasPrefix(p, "secret/") {
			return strings.TrimPrefix(p, "secret/"), nil
		}
		return p, nil
	case strings.HasPrefix(r, "secret/data/"):
		return strings.TrimPrefix(r, "secret/data/"), nil
	case strings.HasPrefix(r, "secret/"):
		return strings.TrimPrefix(r, "secret/"), nil
	case strings.HasPrefix(r, "vault://"):
		return strings.TrimPrefix(r, "vault://"), nil
	default:
		return "", errors.New("invalid credentialRef：必须以 vault: 或 secret/ 开头")
	}
}

// Delete removes a secret from the local stub and best-effort from Vault KV v2.
func (c *Client) Delete(ctx context.Context, ref string) error {
	if c == nil {
		return errors.New("vault client nil")
	}
	if ref == "" {
		return nil
	}
	path, err := c.kvPath(ref)
	if err != nil {
		return err
	}
	c.mu.Lock()
	delete(c.stub, ref)
	c.mu.Unlock()
	if !c.Enabled() || c.token == "" {
		return nil
	}
	url := strings.TrimRight(c.addr, "/") + "/v1/" + c.mount + "/data/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Vault-Token", c.token)
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("vault delete: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 && res.StatusCode != http.StatusNotFound {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("vault delete %d: %s", res.StatusCode, string(raw))
	}
	return nil
}

// Redact ensures logs never contain secret values.
func Redact(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "****"
	}
	return s[:2] + "****" + s[len(s)-2:]
}
