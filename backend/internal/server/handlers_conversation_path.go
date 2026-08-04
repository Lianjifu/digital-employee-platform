package server

import (
	"strings"
)

// conversationIDFromPath extracts :id from:
//
//	/api/conversations/:id/...
//	/api/copilot/conversations/:id/...
func conversationIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	for i, p := range parts {
		if p != "conversations" || i+1 >= len(parts) {
			continue
		}
		next := parts[i+1]
		switch next {
		case "", "stream", "messages", "tasks":
			continue
		default:
			return next
		}
	}
	return ""
}

// resolveMessageBucketID maps a session id to its conversationId for Messages storage.
// Caller may hold RLock or Lock.
func (s *Server) resolveMessageBucketID(ws, raw string) string {
	if raw == "" {
		return raw
	}
	for _, c := range s.Store.Conversations {
		if str(c["id"]) != raw {
			continue
		}
		if w := str(c["workspaceId"]); w != "" && w != ws {
			continue
		}
		return raw
	}
	for _, sess := range s.Store.Sessions {
		if str(sess["id"]) != raw {
			continue
		}
		if str(sess["workspaceId"]) != ws {
			continue
		}
		if cid := str(sess["conversationId"]); cid != "" {
			return cid
		}
		return raw
	}
	return raw
}

func actionIDFromPath(path string) string {
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// /api/actions/:id/approve|execute
	if len(parts) >= 4 && parts[0] == "api" && parts[1] == "actions" {
		return parts[2]
	}
	return ""
}
