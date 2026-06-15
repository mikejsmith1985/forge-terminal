// handlers_sdd.go — the HTTP edge for the SDD orchestrator: POST /api/sdd/decision accepts
// the developer's approve/reject/clarify choice and forwards it to the orchestrator, which
// owns all state and side effects. See specs/003-sdd-phase-orchestrator/contracts.
package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// sddDecisionRequest is the POST /api/sdd/decision body (contract: sdd-decision-endpoint.md).
type sddDecisionRequest struct {
	SessionID   string `json:"sessionId"`
	CardID      string `json:"cardId"`
	Phase       string `json:"phase"`
	Action      string `json:"action"`
	ClarifyText string `json:"clarifyText"`
}

// handleSddDecision applies one decision to the session's pipeline and returns the new status.
//
// It is deliberately LENIENT so the card can never trap the user (the original bug: a stale
// cardId after a re-bind made Approve silently 409, leaving the user stuck enough to kill the
// session). As long as the session has a pending card, the decision is applied to THAT card —
// the one the user is actually looking at — rather than rejected on a cardId/phase mismatch.
func handleSddDecision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeSddError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var request sddDecisionRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeSddError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	pipeline, found := sddPipelineFor(request.SessionID)
	if !found {
		writeSddError(w, http.StatusConflict, "no active SDD pipeline for this session")
		return
	}
	orchestrator := pipeline.orchestrator

	state := orchestrator.State()
	if state.PendingCard == nil {
		writeSddError(w, http.StatusConflict, sdd.ErrNoPendingCard.Error())
		return
	}
	// Lenient: a mismatched cardId is logged, not rejected — acting on the on-screen card beats
	// trapping the user. The frontend's local dismiss is the ultimate escape hatch.
	if request.CardID != "" && request.CardID != state.PendingCard.ID {
		log.Printf("[sdd] decision cardId mismatch (got %q, pending %q) — proceeding on the pending card", request.CardID, state.PendingCard.ID)
	}

	// Use the pending card's phase (not the request's) so a phase mismatch can't trap the user.
	status, err := orchestrator.SubmitDecision(sdd.Decision{
		Phase:       state.PendingCard.Phase,
		Action:      sdd.Action(request.Action),
		ClarifyText: request.ClarifyText,
	})
	if err != nil {
		writeSddDecisionError(w, err)
		return
	}

	// Broadcast updated phase statuses so the SddPipelinePanel reflects the decision immediately.
	broadcastPhaseStatus(request.SessionID)
	writeSddJSON(w, http.StatusOK, map[string]string{"status": string(status)})
}

// handleSddStatus returns the current phase status for a session (used by the
// SddPipelinePanel on mount for cold-start recovery after a page reload; the
// WebSocket SDD_PHASE_STATUS event maintains live state thereafter).
func handleSddStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		writeSddError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	pipeline, ok := sddPipelineFor(sessionID)
	if !ok {
		// No active pipeline — return an empty envelope so the panel shows idle state.
		// 200 (not 404) keeps the frontend simple: no special error handling needed.
		writeSddJSON(w, http.StatusOK, map[string]any{
			"sessionId": sessionID,
			"feature":   "",
			"phases":    []any{},
		})
		return
	}

	state := pipeline.orchestrator.State()
	writeSddJSON(w, http.StatusOK, map[string]any{
		"sessionId": sessionID,
		"feature":   filepath.Base(state.FeatureDir),
		"phases":    buildPhaseStatuses(pipeline),
	})
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
