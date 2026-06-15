// handlers_sdd.go — the HTTP edge for the SDD orchestrator: POST /api/sdd/decision accepts
// the developer's approve/reject/clarify choice and forwards it to the orchestrator, which
// owns all state and side effects. See specs/003-sdd-phase-orchestrator/contracts.
package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// sddOrchestrator is the active pipeline orchestrator, wired at startup. Nil means no
// pipeline is active, which the handler reports as a conflict rather than a crash.
var sddOrchestrator *sdd.Orchestrator

// sddDecisionRequest is the POST /api/sdd/decision body (contract: sdd-decision-endpoint.md).
type sddDecisionRequest struct {
	SessionID   string `json:"sessionId"`
	CardID      string `json:"cardId"`
	Phase       string `json:"phase"`
	Action      string `json:"action"`
	ClarifyText string `json:"clarifyText"`
}

// handleSddDecision applies one decision to the active pipeline and returns the new status.
func handleSddDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeSddError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if sddOrchestrator == nil {
		writeSddError(w, http.StatusConflict, "no active SDD pipeline")
		return
	}

	var request sddDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeSddError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Reject a decision aimed at a card that is no longer current, so a stale UI cannot
	// act on a superseded gate (contract: 409 on cardId mismatch).
	state := sddOrchestrator.State()
	if state.PendingCard == nil {
		writeSddError(w, http.StatusConflict, sdd.ErrNoPendingCard.Error())
		return
	}
	if request.CardID != "" && request.CardID != state.PendingCard.ID {
		writeSddError(w, http.StatusConflict, "stale or unknown cardId")
		return
	}

	status, err := sddOrchestrator.SubmitDecision(sdd.Decision{
		Phase:       sdd.PhaseName(request.Phase),
		Action:      sdd.Action(request.Action),
		ClarifyText: request.ClarifyText,
	})
	if err != nil {
		writeSddDecisionError(w, err)
		return
	}

	writeSddJSON(w, http.StatusOK, map[string]string{"status": string(status)})
}

// writeSddDecisionError maps orchestrator errors to precise HTTP status codes.
func writeSddDecisionError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, sdd.ErrNoPendingCard), errors.Is(err, sdd.ErrCardMismatch):
		writeSddError(w, http.StatusConflict, err.Error())
	case errors.Is(err, sdd.ErrEmptyClarify), errors.Is(err, sdd.ErrUnknownAction):
		writeSddError(w, http.StatusBadRequest, err.Error())
	default:
		writeSddError(w, http.StatusInternalServerError, err.Error())
	}
}

// writeSddError writes a JSON error envelope with the given status code.
func writeSddError(w http.ResponseWriter, code int, message string) {
	writeSddJSON(w, code, map[string]string{"error": message})
}

// writeSddJSON writes a JSON response with the given status code.
func writeSddJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}
