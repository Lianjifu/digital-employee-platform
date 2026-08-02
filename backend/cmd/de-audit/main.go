package main

import (
	"context"
	"log"

	"github.com/digital-employee-platform/backend/internal/deaudit"
)

func main() {
	ctx := context.Background()
	srv, err := deaudit.NewFromEnv(ctx)
	if err != nil {
		log.Fatalf("de-audit: %v (need DE_DATABASE_URL; run: make compose-up)", err)
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
