// handlers_brief.go — serving a published change brief back after a page reload.
//
// The live path for a brief is the WebSocket: it is pushed the moment an agent
// publishes it. This endpoint exists for the one case that path cannot cover —
// the developer reloads, or opens the tab fresh, and a brief published moments
// earlier would otherwise vanish.
//
// That case matters more than it looks. By the time a brief is published, the
// commit gate has already been satisfied, so a brief lost to a refresh leaves
// the developer believing they reviewed a change they never saw. Silence would
// be safer than a false memory of having looked.
package main

import (
	"encoding/json"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// handleBriefLatest returns the most recent brief for a session, if any.
//
// Answers with an empty object rather than a 404 when nothing has been
// published: a session with no brief is the ordinary state at the start of a
// change, not an error the client should have to interpret.
func handleBriefLatest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := r.URL.Query().Get("sessionId")

	w.Header().Set("Content-Type", "application/json")

	// The tab's own project, never the process directory. Launched from a
	// shortcut on Windows the process stands in system32, and a lookup there
	// answered "nothing published" for every tab — which is how a brief lost
	// to a refresh stayed lost. No resolvable project means no brief can
	// exist, and an empty answer is the honest one.
	projectRoot := resolveProjectPathForSession(sessionID)
	if projectRoot == "" {
		_ = json.NewEncoder(w).Encode(map[string]any{})
		return
	}

	briefs, err := workflow.ListBriefs(projectRoot)
	if err != nil {
		http.Error(w, "cannot read briefs", http.StatusInternalServerError)
		return
	}

	// ListBriefs returns newest first, so the first match is the one the
	// developer has most likely not yet seen.
	for _, brief := range briefs {
		if sessionID == "" || brief.SessionID == sessionID || brief.SessionID == "" {
			_ = json.NewEncoder(w).Encode(map[string]any{"brief": brief})
			return
		}
	}

	_ = json.NewEncoder(w).Encode(map[string]any{})
}
