package main

import (
	"log"
	"os"

	"github.com/digital-employee-platform/backend/internal/apprun"
	"github.com/digital-employee-platform/backend/internal/server"
)

// Service: de-core
// Architecture: Hexagonal-compatible shell (ModeAll)
// Port: 8080 (compat)
// Note: Prefer de-sys/collab/cap/workflow; this binary remains for FE VITE_API_BASE.
func main() {
	addr := env("DE_CORE_ADDR", ":8080")
	if err := apprun.Run(apprun.Options{Addr: addr, Mode: server.ModeAll}); err != nil {
		log.Fatal(err)
	}
}

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
