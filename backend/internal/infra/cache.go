package infra

import (
	"context"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache wraps Redis for session / quota / rate-limit keys.
type Cache struct {
	RDB *redis.Client
}

func (c *Cache) Available() bool { return c != nil && c.RDB != nil }

func (c *Cache) SetSession(ctx context.Context, token string, identityJSON string, ttl time.Duration) error {
	if !c.Available() {
		return nil
	}
	return c.RDB.Set(ctx, "sess:"+token, identityJSON, ttl).Err()
}

func (c *Cache) GetSession(ctx context.Context, token string) (string, error) {
	if !c.Available() {
		return "", redis.Nil
	}
	return c.RDB.Get(ctx, "sess:"+token).Result()
}

func (c *Cache) IncrQuota(ctx context.Context, workspaceID, meter string, n int64) (int64, error) {
	if !c.Available() {
		return 0, nil
	}
	key := "quota:" + workspaceID + ":" + meter
	return c.RDB.IncrBy(ctx, key, n).Result()
}

func (c *Cache) AllowRate(ctx context.Context, key string, limit int64, window time.Duration) (bool, error) {
	if !c.Available() {
		return true, nil
	}
	rk := "rl:" + key
	n, err := c.RDB.Incr(ctx, rk).Result()
	if err != nil {
		return true, err
	}
	if n == 1 {
		_ = c.RDB.Expire(ctx, rk, window).Err()
	}
	return n <= limit, nil
}

func (c *Cache) Ping(ctx context.Context) error {
	if !c.Available() {
		return nil
	}
	return c.RDB.Ping(ctx).Err()
}

func FormatInt(n int64) string { return strconv.FormatInt(n, 10) }
