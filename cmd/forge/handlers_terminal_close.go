// handlers_terminal_close.go — the explicit "I am finished with this tab" signal.
//
// Forge keeps an unattended shell alive for a full day so that a dropped
// connection (sleep, Wi-Fi, an app update, an overnight gap) never destroys
// running work. That safety net is only affordable because deliberately closing
// a tab reclaims its shell immediately — without this endpoint every closed tab
// would leave a live shell process behind until the next day.
package main

import (
	"encoding/json"
	"log"
	"net/http"
)

// closeTerminalRequest names the tab whose shell should be terminated.
type closeTerminalRequest struct {
	SessionID string `json:"sessionId"`
}

// handleTerminalClose terminates the terminal session belonging to a closed tab.
//
// It is deliberately forgiving: closing an unknown or already-closed session is
// reported as success, so the frontend can fire it best-effort during teardown
// and safely retry without special-casing failures.
func handleTerminalClose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request closeTerminalRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.SessionID == "" {
		http.Error(w, "sessionId is required", http.StatusBadRequest)
		return
	}

	wasClosed := false
	if termHandler != nil {
		wasClosed = termHandler.CloseSessionNow(request.SessionID)
	}
	log.Printf("[API] Tab closed — terminal session %s reclaimed: %v", request.SessionID, wasClosed)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"closed": wasClosed})
}
