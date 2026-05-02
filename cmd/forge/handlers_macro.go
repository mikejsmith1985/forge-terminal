// handlers_macro.go implements the server-side macro injection endpoint.
//
// Why server-side?
//
//   The legacy macro path waited a fixed delay in the browser and then
//   shipped a bracketed-paste sequence over the WebSocket.  That path is
//   fragile in three ways: (1) the receiving CLI may not have enabled
//   bracketed-paste mode (DECSET 2004), in which case the markers print
//   as garbage; (2) a WebSocket reconnect during the wait silently drops
//   the macro; (3) cold-start variance in copilot/claude/aider CLIs
//   means a single delay value can never cover both fast-path and slow-
//   path startups.  See plan.md for the full root-cause writeup.
//
//   Doing the injection here on the backend lets us:
//     - Wait for the PTY to be quiet for a configurable window before
//       writing, so the macro lands at a real prompt rather than mid-
//       startup output.
//     - Sniff recent PTY output for `\x1b[?2004h` to decide whether the
//       receiving CLI actually accepts bracketed paste, falling back to
//       chunked typed input when it doesn't.
//     - Write directly to the PTY master, which is unaffected by browser
//       WebSocket lifecycle.
//     - Log every attempt to ~/.forge/logs/macro.log for triage.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// MacroRequest describes the body posted to /api/terminal/{id}/macro.
//
// The min/max/quiet knobs are exposed so the frontend can tune behaviour
// per command card if the defaults ever stop working — but most callers
// can omit them entirely and rely on the defaults below.
//
// Mode, when set, overrides the automatic bracketed-paste detection:
//   - "bracketed" — always use bracketed paste (safe for modern AI CLIs)
//   - "chunked"   — always use chunked typed input (debug / legacy use)
//   - ""          — auto-detect via PTY output sniffing (default)
//
// Prefer "bracketed" for AI CLI cards (copilot, claude, aider) because
// all modern CLIs enable DECSET 2004 and the override eliminates the
// chunked fallback that mangles multiline payloads.
type MacroRequest struct {
	Payload    string `json:"payload"`
	Mode       string `json:"mode,omitempty"`       // "bracketed" | "chunked" | "" (auto)
	MinDelayMs int    `json:"minDelayMs,omitempty"` // floor before any quiet-detection starts
	MaxDelayMs int    `json:"maxDelayMs,omitempty"` // hard cap on total wait
	QuietMs    int    `json:"quietMs,omitempty"`    // continuous silence required before paste
}

// MacroResponse is the JSON returned on success.  On error the handler
// returns a structured Problem-Details-ish JSON via writeMacroError.
type MacroResponse struct {
	Delivered bool   `json:"delivered"`
	WaitedMs  int64  `json:"waitedMs"`
	Mode      string `json:"mode"` // "bracketed" | "chunked"
	Bytes     int    `json:"bytes"`
}

// Defaults tuned against copilot/claude/aider cold-starts.  They are
// generous on purpose — a 12-second worst-case is fine because the user
// has already clicked the card and is watching the terminal.  A failed
// macro is a much worse experience than a slow one.
const (
	defaultMacroMinDelayMs = 1500
	defaultMacroMaxDelayMs = 12000
	defaultMacroQuietMs    = 750

	// macroChunkSize is used in the typed-fallback path.  64 bytes is small
	// enough that even line-buffered shells flush after each chunk, but
	// large enough that a 4 KB workflow prompt finishes in well under a
	// second.
	macroChunkSize = 64

	// macroChunkPauseMs is the inter-chunk delay in chunked-typed mode.
	// 8 ms keeps the PTY happy without making the paste feel like real
	// typing.
	macroChunkPauseMs = 8

	// macroPostPasteSettleMs is how long we wait between the closing
	// bracketed-paste marker (or final chunk) and the trailing carriage
	// return that submits the prompt.  TUIs need a moment to ingest the
	// paste event before Enter; without this, the Enter sometimes wins
	// the race and submits a partial buffer.
	macroPostPasteSettleMs = 50
)

// ptyActivityReader is the minimal read-only view of a terminal session
// required by waitForPTYQuiet and pickMacroMode.  Defined as an interface
// so the quiet-detection logic is testable without a real PTY.
type ptyActivityReader interface {
	LastOutputAt() time.Time
	IsBracketedPasteEnabled() bool
	RecentOutput() []byte
}

// ptyWriter is the write side of a terminal session, separated from
// ptyActivityReader so test doubles only need to implement what they use.
type ptyWriter interface {
	WriteToPty([]byte) (int, error)
}

// registerMacroHandler wires POST /api/terminal/{id}/macro into the
// default ServeMux.  Called from main() AFTER termHandler is initialised
// so the closure captures a non-nil pointer.  Auth and license middleware
// match the /ws path: the macro is essentially synthetic terminal input
// and must not be reachable without the same credentials.
func registerMacroHandler() {
	http.HandleFunc("/api/terminal/", AuthMiddleware(LicenseMiddleware(handleMacro)))
}

// handleMacro is the HTTP entry-point.  Path shape:
//
//	POST /api/terminal/{sessionID}/macro
//
// We do not use a router library; the path is parsed by hand to keep
// dependencies minimal.
func handleMacro(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sessionID, ok := parseMacroPath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	var req MacroRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeMacroError(w, http.StatusBadRequest, "invalid JSON body", err)
		return
	}
	if req.Payload == "" {
		writeMacroError(w, http.StatusBadRequest, "payload is required", nil)
		return
	}

	// Apply defaults for any unset knob.  We do this here rather than in
	// the JSON tag so callers explicitly opting out (zero values) get the
	// safe behaviour automatically.
	if req.MinDelayMs <= 0 {
		req.MinDelayMs = defaultMacroMinDelayMs
	}
	if req.MaxDelayMs <= 0 {
		req.MaxDelayMs = defaultMacroMaxDelayMs
	}
	if req.QuietMs <= 0 {
		req.QuietMs = defaultMacroQuietMs
	}

	if termHandler == nil {
		writeMacroError(w, http.StatusServiceUnavailable, "terminal handler not ready", nil)
		return
	}
	session, found := termHandler.GetSession(sessionID)
	if !found {
		appendMacroLog(sessionID, "n/a", 0, len(req.Payload), false, "session not found")
		writeMacroError(w, http.StatusNotFound, "session not found", nil)
		return
	}

	startedAt := time.Now()
	// baseline is the timestamp before the floor sleep.  waitForPTYQuiet
	// will only react to PTY output that arrives AFTER this point, so that
	// terminal output from before the card click cannot trigger a false-quiet
	// and inject the payload prematurely.
	baseline := startedAt

	// Floor wait — gives the just-launched CLI a chance to print its
	// startup banner.  This is the only fixed delay in the new flow.
	time.Sleep(time.Duration(req.MinDelayMs) * time.Millisecond)

	waitForPTYQuiet(session, req.QuietMs, req.MaxDelayMs, startedAt, baseline)

	mode := pickMacroMode(session, req.Mode)
	bytesWritten, err := writeMacro(session, req.Payload, mode)

	waited := time.Since(startedAt).Milliseconds()
	if err != nil {
		appendMacroLog(sessionID, mode, waited, len(req.Payload), false, err.Error())
		writeMacroError(w, http.StatusInternalServerError, "failed to write macro", err)
		return
	}

	appendMacroLog(sessionID, mode, waited, bytesWritten, true, "")
	writeJSON(w, http.StatusOK, MacroResponse{
		Delivered: true,
		WaitedMs:  waited,
		Mode:      mode,
		Bytes:     bytesWritten,
	})
}

// parseMacroPath extracts sessionID from "/api/terminal/{id}/macro".
// Returns ok=false for any other shape so other /api/terminal/ paths can
// be added later without conflict.
func parseMacroPath(path string) (string, bool) {
	const prefix = "/api/terminal/"
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	rest := strings.TrimPrefix(path, prefix)
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "macro" {
		return "", false
	}
	return parts[0], true
}

// waitForPTYQuiet blocks until either:
//   - quietMs milliseconds have passed since the last PTY output that
//     arrived AFTER baseline (output from before the macro request is
//     ignored — otherwise a terminal that was idle before the card click
//     would trigger an immediate false-quiet and inject the payload before
//     the CLI even starts), OR
//   - the CLI was already quiet BEFORE the baseline (fast-start case):
//     inject once quietMs has elapsed since the baseline itself, avoiding
//     an unnecessary wait until maxDelayMs, OR
//   - maxDelayMs milliseconds have passed since startedAt (hard cap).
//
// It polls every 50ms — fine-grained enough to feel snappy, coarse enough
// to barely register on CPU.
func waitForPTYQuiet(session ptyActivityReader, quietMs, maxDelayMs int, startedAt, baseline time.Time) {
	deadline := startedAt.Add(time.Duration(maxDelayMs) * time.Millisecond)
	quietDuration := time.Duration(quietMs) * time.Millisecond
	const pollInterval = 50 * time.Millisecond

	for {
		now := time.Now()
		if now.After(deadline) {
			return
		}

		lastOutput := session.LastOutputAt()

		if !lastOutput.IsZero() && lastOutput.After(baseline) {
			// Normal case: the CLI has produced output after the macro request
			// arrived.  Wait until it has been quiet for quietMs.
			if now.Sub(lastOutput) >= quietDuration {
				return
			}
		} else {
			// Fast-start case: the CLI finished its startup banner before the
			// macro POST even arrived at the server.  lastOutput is either zero
			// or before baseline, so the CLI is already quiet relative to the
			// macro request.  Use baseline as the silence reference — inject
			// once quietMs has passed since the macro was requested rather than
			// waiting until the maxDelayMs hard cap fires.
			if now.Sub(baseline) >= quietDuration {
				return
			}
		}

		time.Sleep(pollInterval)
	}
}

// bracketedPasteEnableSeq is the ANSI escape that a TUI sends to the
// host when it wants bracketed-paste mode active.  If this appears in
// recent PTY output, we know the receiving CLI will correctly treat
// `\x1b[200~ … \x1b[201~` as an opaque paste event.
var bracketedPasteEnableSeq = []byte{0x1b, '[', '?', '2', '0', '0', '4', 'h'}

// pickMacroMode decides how to inject the payload.
//
// Priority order:
//  1. Explicit caller override in req.Mode ("bracketed" or "chunked").
//  2. The persistent isBracketedPasteEnabled flag on the session — set
//     permanently the first time DECSET 2004 appears in PTY output, so
//     CLIs that emitted the sequence early but have since scrolled their
//     startup banner past the ring-buffer cap are still detected correctly.
//  3. Fallback scan of the ring buffer for CLIs that emit DECSET 2004
//     after the macro request arrives but before injection fires.
//
// Prefer "bracketed" whenever possible — chunked mode injects \r characters
// as chunk separators, which causes TUI CLIs (copilot, claude, aider) to
// submit each newline-delimited paragraph as a separate message instead of
// delivering the whole payload as one unit.
func pickMacroMode(session ptyActivityReader, requestedMode string) string {
	// Honour explicit caller override first.
	if requestedMode == "bracketed" || requestedMode == "chunked" {
		return requestedMode
	}

	// Persistent flag: the CLI has announced bracketed-paste support at
	// some point during this session, regardless of ring-buffer eviction.
	if session.IsBracketedPasteEnabled() {
		return "bracketed"
	}

	// Secondary: scan the current ring buffer in case the CLI emitted the
	// sequence after the macro request was received but before this check.
	if bytes.Contains(session.RecentOutput(), bracketedPasteEnableSeq) {
		return "bracketed"
	}

	return "chunked"
}

// writeMacro performs the actual PTY write.  It returns the total bytes
// written (excluding the trailing CR) so the caller can log the size.
func writeMacro(session ptyWriter, payload, mode string) (int, error) {
	// Normalise newlines: bracketed-paste mode expects CR (0x0D) as the
	// in-paste line separator.  Chunked-typed mode also wants CR, since
	// most TUIs interpret LF mid-input as a literal character.
	normalized := strings.ReplaceAll(payload, "\r\n", "\r")
	normalized = strings.ReplaceAll(normalized, "\n", "\r")

	if mode == "bracketed" {
		return writeBracketed(session, normalized)
	}
	return writeChunked(session, normalized)
}

func writeBracketed(session ptyWriter, payload string) (int, error) {
	var buf bytes.Buffer
	buf.WriteString("\x1b[200~")
	buf.WriteString(payload)
	buf.WriteString("\x1b[201~")
	if _, err := session.WriteToPty(buf.Bytes()); err != nil {
		return 0, err
	}
	time.Sleep(macroPostPasteSettleMs * time.Millisecond)
	if _, err := session.WriteToPty([]byte("\r")); err != nil {
		return len(payload), err
	}
	return len(payload), nil
}

func writeChunked(session ptyWriter, payload string) (int, error) {
	for offset := 0; offset < len(payload); offset += macroChunkSize {
		end := offset + macroChunkSize
		if end > len(payload) {
			end = len(payload)
		}
		if _, err := session.WriteToPty([]byte(payload[offset:end])); err != nil {
			return offset, err
		}
		time.Sleep(macroChunkPauseMs * time.Millisecond)
	}
	time.Sleep(macroPostPasteSettleMs * time.Millisecond)
	if _, err := session.WriteToPty([]byte("\r")); err != nil {
		return len(payload), err
	}
	return len(payload), nil
}

// writeMacroError emits a structured error response and logs internally.
// Kept separate from writeJSON so the wire shape can evolve without
// touching successful responses.
func writeMacroError(w http.ResponseWriter, status int, msg string, cause error) {
	body := map[string]any{"error": msg}
	if cause != nil {
		body["cause"] = cause.Error()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// writeJSON is defined in handlers_notify.go and reused here.

// appendMacroLog writes one line to ~/.forge/logs/macro.log.  Best-effort:
// if the log can't be written we still proceed with the response so a
// disk-full edge case can't break the user-visible flow.
func appendMacroLog(sessionID, mode string, waitedMs int64, bytesWritten int, delivered bool, errMsg string) {
	logsDir := filepath.Join(storage.GetForgeDir(), "logs")
	if err := os.MkdirAll(logsDir, 0o755); err != nil {
		log.Printf("[Macro] failed to ensure logs dir: %v", err)
		return
	}
	path := filepath.Join(logsDir, "macro.log")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		log.Printf("[Macro] failed to open log: %v", err)
		return
	}
	defer f.Close()

	line := fmt.Sprintf(
		"%s session=%s waited=%dms mode=%s bytes=%d delivered=%t",
		time.Now().UTC().Format(time.RFC3339),
		sessionID, waitedMs, mode, bytesWritten, delivered,
	)
	if errMsg != "" {
		line += " err=" + strings.ReplaceAll(errMsg, "\n", " ")
	}
	if _, err := fmt.Fprintln(f, line); err != nil {
		log.Printf("[Macro] failed to append log line: %v", err)
	}
}
