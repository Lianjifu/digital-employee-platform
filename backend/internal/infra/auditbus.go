package infra

import (
	"context"
	"encoding/json"
	"log"

	"github.com/redis/go-redis/v9"
)

// AuditBus publishes audit events to a Redis Stream (Kafka Topic stand-in until M4-5).
type AuditBus struct {
	RDB    *redis.Client
	Stream string
}

func NewAuditBus(rdb *redis.Client) *AuditBus {
	if rdb == nil {
		return nil
	}
	return &AuditBus{RDB: rdb, Stream: "de:audit"}
}

func (b *AuditBus) Publish(ctx context.Context, ev map[string]any) {
	if b == nil || b.RDB == nil {
		return
	}
	payload, _ := json.Marshal(ev)
	if err := b.RDB.XAdd(ctx, &redis.XAddArgs{
		Stream: b.Stream,
		Values: map[string]any{"payload": string(payload)},
		MaxLen: 10000,
		Approx: true,
	}).Err(); err != nil {
		log.Printf("audit bus publish failed: %v", err)
	}
}
