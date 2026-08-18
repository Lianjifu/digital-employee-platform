// Package apprun boots a coarse-grained control-plane process (de-sys / collab / cap / workflow).
package apprun

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

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
	if opts.Mode == "" || opts.Mode == server.ModeAll {
		// ModeAll is for unit tests only; deployment binaries must set ModeSys/Collab/Cap/Workflow.
		if opts.Mode == server.ModeAll && os.Getenv("DE_ALLOW_MODE_ALL") != "1" {
			return fmt.Errorf("refusing ModeAll deployment (set DE_SERVICE=sys|collab|cap|workflow); use make compose-up-coarse")
		}
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
	domain := store.DomainFromMode(opts.Mode.String())
	st.SetWriteDomain(domain)
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
	kernel := &infra.KernelStore{Pool: pg}
	if err := kernel.Ensure(ctx); err != nil {
		log.Printf("kernel schema: %v", err)
	}

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
	st.SetPersistHook(func(ctx context.Context, collection string, items []map[string]any) error {
		if kernel.Owns(collection) {
			if err := kernel.UpsertCollection(ctx, collection, items); err != nil {
				return err
			}
		}
		// Multi-process safe default: upsert merge. Full replace only for shrink-heavy single-writer collections.
		if store.ShouldReplaceOnPersist(collection) {
			return kv.ReplaceCollection(ctx, collection, items)
		}
		return kv.UpsertMany(ctx, collection, items)
	})
	st.SetDeleteHook(func(ctx context.Context, collection string, ids []string) error {
		return kv.DeleteMany(ctx, collection, ids)
	})

	hydrated := 0
	for _, coll := range store.CollectionsForDomain(domain) {
		var items []map[string]any
		if kernel.Owns(coll) {
			rows, err := kernel.List(ctx, coll)
			if err != nil {
				log.Printf("kernel hydrate %s: %v", coll, err)
			} else if len(rows) > 0 {
				items = rows
			}
		}
		if len(items) == 0 {
			kvItems, err := kv.List(ctx, coll)
			if err != nil {
				log.Printf("hydrate %s: %v", coll, err)
				continue
			}
			items = kvItems
		}
		if len(items) > 0 {
			st.HydrateFrom(coll, items)
			hydrated++
		}
	}
	if n, _ := kv.Count(ctx, store.SeedCollection(domain)); n == 0 {
		if err := st.PersistNow(ctx); err != nil {
			log.Printf("initial persist: %v", err)
		} else {
			log.Printf("seeded %s collections into postgres", domain)
		}
	} else if hydrated > 0 {
		log.Printf("hydrated %d durable collections from postgres [domain=%s]", hydrated, domain)
	}
	st.DropUnowned(domain)
	if domain == store.DomainAll || domain == store.DomainCap {
		st.EnsureDocxSkillReady()
		st.Persist("skills")
	}
	if domain == store.DomainAll || domain == store.DomainCollab {
		st.Persist("employees")
	}

	srv := server.New(st)
	srv.Mode = opts.Mode
	srv.PG = pg
	srv.Cache = &infra.Cache{RDB: rdb}
	srv.AuditSink = auditSink
	srv.UsageSink = &infra.UsageSink{Pool: pg}
	srv.KV = kv
	srv.Search = search
	if opts.Mode == server.ModeCap || opts.Mode == server.ModeCollab || opts.Mode == server.ModeAll {
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
