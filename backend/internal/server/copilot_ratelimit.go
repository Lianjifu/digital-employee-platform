package server

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	apperr "github.com/digital-employee-platform/backend/pkg/errors"
)

type rateBucket struct {
	tokens float64
	last   time.Time
}

type copilotRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	rate    float64
	burst   float64
}

func newCopilotRateLimiter() *copilotRateLimiter {
	rpm := 30
	if v := strings.TrimSpace(os.Getenv("DE_COPILOT_RPM")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			rpm = n
		}
	}
	return &copilotRateLimiter{
		buckets: map[string]*rateBucket{},
		rate:    float64(rpm) / 60.0,
		burst:   float64(rpm),
	}
}

var globalCopilotRL = newCopilotRateLimiter()

func (l *copilotRateLimiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	b := l.buckets[key]
	if b == nil {
		b = &rateBucket{tokens: l.burst, last: now}
		l.buckets[key] = b
	}
	elapsed := now.Sub(b.last).Seconds()
	b.tokens += elapsed * l.rate
	if b.tokens > l.burst {
		b.tokens = l.burst
	}
	b.last = now
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (s *Server) allowCopilotTurn(ws, userID string) bool {
	key := fmt.Sprintf("%s:%s", ws, userID)
	ok := globalCopilotRL.allow(key)
	if !ok {
		IncCopilotRateLimited()
	}
	return ok
}

type streamCancelEntry struct {
	cancel context.CancelFunc
}

var (
	streamCancels sync.Map
	streamIdempot sync.Map
)

func registerStreamCancel(corr string, cancel context.CancelFunc) {
	if corr == "" {
		return
	}
	streamCancels.Store(corr, &streamCancelEntry{cancel: cancel})
}

func clearStreamCancel(corr string) {
	streamCancels.Delete(corr)
}

func cancelStreamByCorrelation(corr string) bool {
	if v, ok := streamCancels.Load(corr); ok {
		if e, ok := v.(*streamCancelEntry); ok && e.cancel != nil {
			e.cancel()
			return true
		}
	}
	return false
}

func idempotencyKey(cid, clientMsgID string) string {
	return cid + "|" + clientMsgID
}

func rememberIdempotentReply(s *Server, cid, clientMsgID string, assistant map[string]any) {
	if clientMsgID == "" {
		return
	}
	key := idempotencyKey(cid, clientMsgID)
	streamIdempot.Store(key, assistant)
	if s != nil && s.Store != nil {
		if s.Store.CopilotIdempotency == nil {
			s.Store.CopilotIdempotency = map[string]map[string]any{}
		}
		cp := map[string]any{}
		for k, v := range assistant {
			cp[k] = v
		}
		s.Store.CopilotIdempotency[key] = cp
	}
}

func (s *Server) loadIdempotentReply(cid, clientMsgID string) map[string]any {
	if clientMsgID == "" {
		return nil
	}
	key := idempotencyKey(cid, clientMsgID)
	if v, ok := streamIdempot.Load(key); ok {
		if m, ok := v.(map[string]any); ok {
			return m
		}
	}
	if s != nil && s.Store != nil {
		s.Store.RLock()
		if s.Store.CopilotIdempotency != nil {
			if m, ok := s.Store.CopilotIdempotency[key]; ok && m != nil {
				s.Store.RUnlock()
				return m
			}
		}
		msgs := append([]map[string]any{}, s.Store.Messages[cid]...)
		s.Store.RUnlock()
		for i, m := range msgs {
			if str(m["clientMsgId"]) != clientMsgID || str(m["role"]) != "user" {
				continue
			}
			for j := i + 1; j < len(msgs); j++ {
				if str(msgs[j]["role"]) == "assistant" {
					cp := map[string]any{}
					for k, v := range msgs[j] {
						cp[k] = v
					}
					streamIdempot.Store(key, cp)
					return cp
				}
			}
		}
	}
	return nil
}

func (s *Server) cancelCopilotTurn(r *http.Request) (any, error) {
	body, _ := decodeMap(r)
	corr := coalesce(str(body["correlationId"]), r.Header.Get("x-correlation-id"))
	if corr == "" {
		return nil, apperr.BadReq(apperr.BadRequest, "缺少 correlationId")
	}
	ok := cancelStreamByCorrelation(corr)
	return map[string]any{"ok": ok, "correlationId": corr}, nil
}
