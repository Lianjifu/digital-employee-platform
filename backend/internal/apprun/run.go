// Package apprun boots a coarse-grained control-plane process (de-sys / collab / cap / core).
package apprun

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

// Options configures Listen address and ServiceMode.
type Options struct {
	Addr string
	Mode server.ServiceMode
}

// Run blocks serving HTTP for the given coarse-grained unit.
func Run(opts Options) error {
	if opts.Mode == "" {
		opts.Mode = server.ParseServiceMode(os.Getenv("DE_SERVICE"))
	}
	if opts.Addr == "" {
		opts.Addr = env("DE_LISTEN_ADDR", ":8080")
	}
	ctx := context.Background()

	pg, err := infra.OpenPostgres(ctx)
	if err != nil {
		return err
	}
	rdb, err := infra.OpenRedis(ctx)
	if err != nil {
		return err
	}

	st := store.New()
	auditSink := &infra.AuditSink{Pool: pg}
	auditBus := infra.NewAuditBus(rdb)
	kafkaBus := infra.NewKafkaAuditBusFromEnv()
	search := infra.NewOpenSearchAuditFromEnv()
	if search != nil {
		if err := search.EnsureIndex(ctx); err != nil {
			log.Printf("opensearch ensure index: %v", err)
		}
	}
	kv := &infra.KVStore{Pool: pg}
	auditClient := deaudit.NewClientFromEnv()

	// When running as de-sys (or all), prefer local audit sink so we don't depend on :8095.
	useRemoteAudit := auditClient.Available() && opts.Mode != server.ModeSys && opts.Mode != server.ModeAll
	if useRemoteAudit {
		log.Printf("audit fanout → de-audit (%s)", auditClient.Base)
		st.SetAuditHook(func(ev map[string]any) {
			if err := auditClient.Append(context.Background(), ev); err != nil {
				server.IncAuditWriteFailure()
				log.Printf("audit fanout de-audit: %v", err)
			}
		})
	} else {
		st.SetAuditHook(func(ev map[string]any) {
			c := context.Background()
			failed := false
			if err := auditSink.Append(c, ev); err != nil {
				failed = true
				log.Printf("audit pg append: %v", err)
			}
			if auditBus != nil {
				auditBus.Publish(c, ev)
			}
			if kafkaBus != nil {
				kafkaBus.Publish(c, ev)
			}
			if search != nil {
				if err := search.IndexEvent(c, ev); err != nil {
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
		}
	}
	if n, _ := kv.Count(ctx, "workspaces"); n == 0 {
		if err := st.PersistNow(ctx); err != nil {
			log.Printf("initial persist: %v", err)
		} else {
			log.Printf("seeded control-plane collections into postgres")
		}
	} else if hydrated > 0 {
		log.Printf("hydrated %d durable collections from postgres", hydrated)
	}

	srv := server.New(st)
	srv.Mode = opts.Mode
	srv.PG = pg
	srv.Cache = &infra.Cache{RDB: rdb}
	srv.AuditSink = auditSink
	srv.UsageSink = &infra.UsageSink{Pool: pg}
	srv.KV = kv
	srv.Search = search
	if opts.Mode == server.ModeAll || opts.Mode == server.ModeCap || opts.Mode == server.ModeCollab {
		srv.StartMemoryMaintenance()
	}

	httpServer := &http.Server{
		Addr:              opts.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("%s listening on %s [mode=%s]", opts.Mode.String(), opts.Addr, opts.Mode)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
