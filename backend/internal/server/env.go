package server

import "os"

func lookupEnv(k string) string { return os.Getenv(k) }
