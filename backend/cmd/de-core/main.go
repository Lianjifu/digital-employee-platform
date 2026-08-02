package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/digital-employee-platform/backend/internal/deaudit"
	"github.com/digital-employee-platform/backend/internal/infra"
	"github.com/digital-employee-platform/backend/internal/server"
	"github.com/digital-employee-platform/backend/internal/store"
)

func main() {
	addr := env("DE_CORE_ADDR", ":8080")
	ctx := context.Background()

	pg, err := infra.OpenPostgres(ctx)
	if err != nil {
		log.Fatalf("postgres: %v (run: cd backend && make compose-up)", err)
	}
	rdb, err := infra.OpenRedis(ctx)
	if err != nil {
		log.Fatalf("redis: %v (run: cd backend && make compose-up)", err)
	}

	st := store.New()
	auditSink := &infra.AuditSink{Pool: pg}
	auditBus := infra.NewAuditBus(rdb)
	kafkaBus := infra.NewKafkaAuditBusFromEnv()
	search := infra.NewOpenSearchAuditFromEnv()
	if search != nil {
		if err := search.EnsureIndex(ctx); err != nil {
			log.Printf("opensearch ensure index: %v", err)
		} else {
			log.Printf("opensearch audit index ready (%s)", search.Base)
		}
	}
	kv := &infra.KVStore{Pool: pg}
	auditClient := deaudit.NewClientFromEnv()
	if auditClient.Available() {
		log.Printf("audit fanout → de-audit (%s)", auditClient.Base)
		st.SetAuditHook(func(ev map[string]any) {
			if err := auditClient.Append(context.Background(), ev); err != nil {
				server.IncAuditWriteFailure()
				log.Printf("audit fanout de-audit: %v", err)
			}
		})
	} else {
		st.SetAuditHook(func(ev map[string]any) {
			ctx := context.Background()
			failed := false
			if err := auditSink.Append(ctx, ev); err != nil {
				failed = true
				log.Printf("audit pg append: %v", err)
			}
			if auditBus != nil {
				auditBus.Publish(ctx, ev)
			}
			if kafkaBus != nil {
				kafkaBus.Publish(ctx, ev)
			}
			if search != nil {
				if err := search.IndexEvent(ctx, ev); err != nil {
					failed = true
					log.Printf("audit opensearch index: %v", err)
				}
			}
			if failed {
				server.IncAuditWriteFailure()
			}
		})
	}
	st.SetPersistHook(func(ctx context.Context, collection string, items []map[string]any) error {
		return kv.ReplaceCollection(ctx, collection, items)
	})

	hydrated := 0
	for _, coll := range store.DurableCollections {
		items, err := kv.List(ctx, coll)
		if err != nil {
			log.Printf("hydrate %s: %v", coll, err)
			continue
		}
		if len(items) > 0 {
			st.HydrateFrom(coll, items)
			hydrated++
			log.Printf("hydrated %s (%d docs)", coll, len(items))
		}
	}
	if n, _ := kv.Count(ctx, "workspaces"); n == 0 {
		if err := st.PersistNow(ctx); err != nil {
			log.Printf("initial persist: %v", err)
		} else {
			log.Printf("seeded %d control-plane collections into postgres", len(store.DurableCollections))
		}
	} else if hydrated > 0 {
		log.Printf("hydrated %d durable collections from postgres", hydrated)
	}

	srv := server.New(st)
	srv.PG = pg
	srv.Cache = &infra.Cache{RDB: rdb}
	srv.AuditSink = auditSink
	srv.UsageSink = &infra.UsageSink{Pool: pg}
	srv.KV = kv
	srv.Search = search

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	mode := "postgres+redis(docker)"
	if srv.Workflows != nil && srv.Workflows.TemporalConfigured() {
		mode += "+temporal"
	}
	log.Printf("de-core listening on %s [%s]", addr, mode)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
