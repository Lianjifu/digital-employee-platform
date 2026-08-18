package server

import (
	"os"
	"strings"
)

// replicaStandby is the phase-4 multi-active min slice: a standby instance
// rejects mutating requests (writes go to the active replica).
func replicaStandby() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("DE_REPLICA_MODE")))
	return v == "standby" || v == "readonly" || v == "passive"
}

func replicaRole() string {
	if replicaStandby() {
		return "standby"
	}
	return "active"
}

func instanceID() string {
	if v := strings.TrimSpace(os.Getenv("DE_INSTANCE_ID")); v != "" {
		return v
	}
	h, _ := os.Hostname()
	if strings.TrimSpace(h) == "" {
		return "local"
	}
	return h
}

func replicaWriteAllowedMethod(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case "GET", "HEAD", "OPTIONS":
		return true
	default:
		return false
	}
}
