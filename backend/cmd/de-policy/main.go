package main

import (
	"log"

	"github.com/digital-employee-platform/backend/internal/depolicy"
)

func main() {
	srv := depolicy.NewFromEnv()
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
