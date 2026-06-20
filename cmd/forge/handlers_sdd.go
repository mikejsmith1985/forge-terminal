// handlers_sdd.go — the HTTP edge for the SDD orchestrator: POST /api/sdd/decision accepts
// the developer's approve/reject/clarify choice and forwards it to the orchestrator, which
// owns all state and side effects. See specs/003-sdd-phase-orchestrator/contracts.
package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

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
	response := map[string]any{
		"sessionId": sessionID,
		"feature":   filepath.Base(state.FeatureDir),
		"phases":    buildPhaseStatuses(pipeline),
	}
	// Include the pending card so the frontend can restore the decision bar after a
	// page reload — SDD_PHASE_GATE events are not replayed on reconnect (FR-012).
	if state.PendingCard != nil {
		response["pendingCard"] = state.PendingCard
	}
	writeSddJSON(w, http.StatusOK, response)
}

// handleSddGateCheck reports whether any active SDD pipeline has an open gate awaiting a
// developer decision. This is the enforcement endpoint called by the PreToolUse hook in
// .claude/settings.json before any speckit Skill runs. A non-zero exit from the hook
// physically blocks the agent from executing the next phase command.
//
// Returns {"isGateOpen": false} when all pipelines are idle, or {"isGateOpen": true,
// "phase": "<name>"} when any pipeline is in StatusAwaitingDecision. The response is
// always 200 so the hook script can parse it without special HTTP error handling.
func handleSddGateCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeSddError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var openPhase sdd.PhaseName
	var isGateOpen bool
	sddPipelines.Range(func(_, value any) bool {
		pipeline := value.(*sddPipeline)
		state := pipeline.orchestrator.State()
		if state.Status == sdd.StatusAwaitingDecision && state.PendingCard != nil {
			isGateOpen = true
			openPhase = state.PendingCard.Phase
			return false // stop iterating — the first open gate is sufficient
		}
		return true
	})

	writeSddJSON(w, http.StatusOK, map[string]any{
		"isGateOpen": isGateOpen,
		"phase":      string(openPhase),
	})
}

// sddHookScriptName is the unique identifier within .claude/settings.json that proves
// the SDD gate enforcement hook is installed. We use a substring match so the check
// is robust to minor path variations in the surrounding JSON.
const sddHookScriptName = "sdd-gate-check.ps1"

// handleSddHookStatus reports whether the SDD gate enforcement PreToolUse hook is installed
// in the project-level .claude/settings.json. The frontend calls this on mount to decide
// whether to show the "install the hook" prompt. Always succeeds — absence of the file
// simply means the hook is not installed.
func handleSddHookStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeSddError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeSddJSON(w, http.StatusOK, map[string]any{"isInstalled": isSddHookInstalled()})
}

// isSddHookInstalled checks both the project-level .claude/settings.json and the global
// ~/.claude/settings.json for the SDD gate enforcement hook command. Either location is
// sufficient — the hook fires globally when installed in the user directory, which is the
// recommended install path so it covers all repositories.
func isSddHookInstalled() bool {
	return isSddHookInstalledFromPaths(sddHookSettingsPaths())
}

// isSddHookInstalledFromPaths checks the supplied list of settings file paths for the
// SDD gate enforcement hook. A substring match on raw bytes is intentional: it avoids a
// full JSON parse while being robust to cosmetic whitespace differences in the file.
// Separated from isSddHookInstalled so tests can inject controlled paths without touching
// the real user home directory.
func isSddHookInstalledFromPaths(settingsPaths []string) bool {
	for _, settingsPath := range settingsPaths {
		rawBytes, readErr := os.ReadFile(settingsPath)
		if readErr != nil {
			continue
		}
		if strings.Contains(string(rawBytes), sddHookScriptName) {
			return true
		}
	}
	return false
}

// sddHookSettingsPaths returns the ordered list of Claude Code settings files to check
// for the SDD gate enforcement hook. Project-level is checked first; global user-level
// is the canonical install location when the hook should cover all repositories.
func sddHookSettingsPaths() []string {
	paths := []string{filepath.Join(".claude", "settings.json")}
	if homeDir, err := os.UserHomeDir(); err == nil {
		paths = append(paths, filepath.Join(homeDir, ".claude", "settings.json"))
	}
	return paths
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
