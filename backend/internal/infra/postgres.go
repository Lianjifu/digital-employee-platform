package infra

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OpenPostgres connects to Docker Compose Postgres via DE_DATABASE_URL.
// Returns nil pool when URL is empty (tests / memory-only mode).
func OpenPostgres(ctx context.Context) (*pgxpool.Pool, error) {
	url := os.Getenv("DE_DATABASE_URL")
	if url == "" {
		return nil, nil
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse DE_DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 16
	cfg.MinConns = 1
	cfg.MaxConnLifetime = time.Hour

	var pool *pgxpool.Pool
	var last error
	for i := 0; i < 30; i++ {
		pool, last = pgxpool.NewWithConfig(ctx, cfg)
		if last == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				log.Printf("postgres connected (%s)", redactURL(url))
				return pool, nil
			} else {
				last = pingErr
				pool.Close()
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return nil, fmt.Errorf("postgres not ready after retries: %w", last)
}

func MustReady(ctx context.Context, pool *pgxpool.Pool) error {
	if pool == nil {
		return fmt.Errorf("DE_DATABASE_URL 未设置：请先 make compose-up，并 export DE_DATABASE_URL")
	}
	return pool.Ping(ctx)
}

func redactURL(u string) string {
	// postgres://user:pass@host → postgres://user:***@host
	at := -1
	for i := 0; i < len(u); i++ {
		if u[i] == '@' {
			at = i
			break
		}
	}
	if at < 0 {
		return "postgres"
	}
	colon := -1
	for i := 0; i < at; i++ {
		if u[i] == ':' && i > len("postgres://") {
			colon = i
			break
		}
	}
	if colon < 0 {
		return u[:at] + "@…"
	}
	return u[:colon+1] + "***" + u[at:]
}
