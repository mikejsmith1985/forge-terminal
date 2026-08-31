// handlers_format_check.go — reporting when a reply became a wall of text.
//
// Advisory in the strongest sense. The verdict this serves is drawn from the
// terminal scrollback, which holds the screen redraws of a full-screen program
// rather than a transcript, so it is a guess. It is served as something to show
// the developer and nothing else: no caller may treat it as a decision, and
// there is deliberately no endpoint that acts on it.
//
// It earns its place anyway. The format rule it watches was broken for months
// without anyone noticing, because nothing was counting.
package main

import (
	"encoding/json"
	"net/http"

	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
)

// handleFormatCheck reports whether recent output in a session reads as a wall of text.
//
// Answers with `shouldWarn: false` rather than an error when the session is
// unknown or has said nothing: a quiet session is the ordinary case, and the
// client should not have to distinguish it from a failure.
func handleFormatCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID := r.URL.Query().Get("sessionId")

	w.Header().Set("Content-Type", "application/json")

	// The handler is nil before startup finishes wiring the terminal, and in
	// any context that serves routes without one. Answering "nothing to
	// report" is right in both: this is advisory, so its absence is not a
	// failure worth telling anybody about.
	if termHandler == nil {
		_ = json.NewEncoder(w).Encode(map[string]any{"shouldWarn": false})
		return
	}

	scrollback, wasFound := termHandler.GetSessionScrollback(sessionID)
	if !wasFound || len(scrollback) == 0 {
		_ = json.NewEncoder(w).Encode(map[string]any{"shouldWarn": false})
		return
	}

	verdict := terminal.CheckFormat(string(scrollback))

	_ = json.NewEncoder(w).Encode(map[string]any{
		"shouldWarn": verdict.ShouldWarn(),
		"summary":    verdict.Summary,
		"words":      verdict.LongestSectionWords,
	})
}
