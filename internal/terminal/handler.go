// Package terminal provides WebSocket terminal handler.
package terminal

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// Custom WebSocket close codes (4000-4999 range is for application use)
const (
	CloseCodePTYExited          = 4000 // Shell process exited normally
	CloseCodeTimeout            = 4001 // Session timed out
	CloseCodePTYError           = 4002 // PTY read/write error (temporary — client should reconnect)
	CloseCodeSessionRestart     = 4003 // All sessions restarted (server still running)
	CloseCodeSystemSleep        = 4004 // System is suspending (sleep/hibernate)
	CloseCodeSessionSpawnFailed = 4005 // PTY process could not be spawned (fatal — client should stop retrying)
)

// PTYLogEntry represents a single PTY I/O operation for debugging
type PTYLogEntry struct {
	Timestamp   int64  `json:"timestamp"`   // Unix timestamp in milliseconds
	Direction   string `json:"direction"`   // "to_pty" or "from_pty"
	Data        string `json:"data"`        // Hex-encoded bytes for safe JSON storage
	Size        int    `json:"size"`        // Number of bytes
	Text        string `json:"text"`        // Human-readable text (printable ASCII only)
	SessionID   string `json:"sessionId"`   // Terminal session ID
}

// PTYLogger manages PTY logging for Follow Me debugger integration
type PTYLogger struct {
	mu          sync.RWMutex
	enabled     map[string]bool      // map[sessionID]enabled
	logs        map[string][]PTYLogEntry // map[sessionID][]logs
	maxLogsPerSession int            // Prevent OOM
}

var globalPTYLogger = &PTYLogger{
	enabled: make(map[string]bool),
	logs:    make(map[string][]PTYLogEntry),
	maxLogsPerSession: 10000, // 10k entries max per session
}

// EnablePTYLogging enables PTY byte logging for a session (for Follow Me debugger)
func (l *PTYLogger) EnablePTYLogging(sessionID string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.enabled[sessionID] = true
	l.logs[sessionID] = make([]PTYLogEntry, 0, 100)
	log.Printf("[PTYLogger] Enabled for session %s", sessionID)
}

// DisablePTYLogging disables PTY logging and clears logs for a session
func (l *PTYLogger) DisablePTYLogging(sessionID string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.enabled, sessionID)
	delete(l.logs, sessionID)
	log.Printf("[PTYLogger] Disabled for session %s", sessionID)
}

// IsEnabled checks if PTY logging is enabled for a session
func (l *PTYLogger) IsEnabled(sessionID string) bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.enabled[sessionID]
}

// LogPTY logs a PTY I/O operation if logging is enabled for the session
func (l *PTYLogger) LogPTY(sessionID, direction string, data []byte) {
	if !l.IsEnabled(sessionID) {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	// Check if logs exist for session
	sessionLogs, exists := l.logs[sessionID]
	if !exists {
		return
	}

	// Prevent OOM: limit log entries per session
	if len(sessionLogs) >= l.maxLogsPerSession {
		log.Printf("[PTYLogger] Session %s reached max log entries (%d), dropping oldest", sessionID, l.maxLogsPerSession)
		// Drop oldest 10% of logs
		dropCount := l.maxLogsPerSession / 10
		sessionLogs = sessionLogs[dropCount:]
	}

	// Create log entry
	entry := PTYLogEntry{
		Timestamp: time.Now().UnixMilli(),
		Direction: direction,
		Data:      fmt.Sprintf("%x", data), // Hex encoding for safe JSON storage
		Size:      len(data),
		Text:      getPrintableText(data),
		SessionID: sessionID,
	}

	l.logs[sessionID] = append(sessionLogs, entry)
}

// GetLogs retrieves all PTY logs for a session
func (l *PTYLogger) GetLogs(sessionID string) []PTYLogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()
	
	logs, exists := l.logs[sessionID]
	if !exists {
		return nil
	}
	
	// Return a copy to avoid race conditions
	result := make([]PTYLogEntry, len(logs))
	copy(result, logs)
	return result
}

// getPrintableText converts bytes to printable ASCII text for readability
// Non-printable characters are shown as escape sequences (e.g., \r, \n, \x08 for backspace)
func getPrintableText(data []byte) string {
	var sb strings.Builder
	for _, b := range data {
		switch b {
		case '\r':
			sb.WriteString("\\r")
		case '\n':
			sb.WriteString("\\n")
		case '\t':
			sb.WriteString("\\t")
		case 0x08: // Backspace
			sb.WriteString("\\b")
		case 0x7F: // DEL (also used as backspace in some terminals)
			sb.WriteString("\\x7F")
		case 0x1B: // ESC
			sb.WriteString("\\e")
		default:
			if b >= 32 && b < 127 { // Printable ASCII
				sb.WriteByte(b)
			} else {
				sb.WriteString(fmt.Sprintf("\\x%02x", b))
			}
		}
	}
	return sb.String()
}

// Handler manages WebSocket terminal connections.
type Handler struct {
	upgrader             websocket.Upgrader
	sessions             sync.Map // map[string]*TerminalSession
	detachedSessions     sync.Map // map[string]*DetachedSession — PTY sessions kept alive after WS disconnect
	hubs                 sync.Map // map[string]*sessionHub — one hub per sessionID, shared across clients
	sessionCreateLocks   sync.Map // map[string]*sync.Mutex — per-sessionID creation lock preventing duplicate PTY processes
	visionParser         *vision.Parser
	llmDetector          *llm.Detector
	restartRequested     atomic.Bool // Flag to indicate session restart is in progress
	systemSleepRequested atomic.Bool // Flag to indicate system sleep is closing sessions
}

// DetachedSession represents a PTY session that outlived its WebSocket connection.
// The PTY process continues running; output accumulates in the OS pipe buffer.
// A reconnecting client can reattach within the grace period to resume I/O.
type DetachedSession struct {
	session     *TerminalSession
	graceTimer  *time.Timer
	detachedAt  time.Time
	gracePeriod time.Duration
	readerDone  chan struct{} // Close to stop the orphaned PTY reader goroutine
}

const sessionGracePeriod = 5 * time.Minute  // How long a detached PTY stays alive
const agentGracePeriod   = 8 * time.Hour   // Extended grace when an AI agent is running

// detachSession keeps a PTY alive after its WebSocket disconnects.
// If the PTY process has already exited, the session is closed immediately.
// readerDone is closed on reattach to stop the orphaned PTY reader goroutine,
// preventing two goroutines from racing on the same PTY fd.
func (h *Handler) detachSession(sessionID string, session *TerminalSession, gracePeriod time.Duration, readerDone chan struct{}) {
	// Don't detach if PTY is already dead — nothing to reconnect to
	if session.IsDone() || session.IsClosed() {
		log.Printf("[Terminal] Session %s: PTY already exited, closing (not detaching)", sessionID)
		session.Close()
		// Clean up maps since nothing to reconnect to
		if hubRaw, ok := h.hubs.LoadAndDelete(sessionID); ok {
			hubRaw.(*sessionHub).close()
		}
		h.sessions.Delete(sessionID)
		return
	}

	ds := &DetachedSession{
		session:     session,
		detachedAt:  time.Now(),
		gracePeriod: gracePeriod,
		readerDone:  readerDone,
	}

	ds.graceTimer = time.AfterFunc(gracePeriod, func() {
		log.Printf("[Terminal] Session %s: grace period expired after %v, closing PTY",
			sessionID, gracePeriod)
		h.detachedSessions.Delete(sessionID)
		// Grace expired with no reconnect — now clean up the hub and session
		// from the maps. This is the ONLY place these should be deleted,
		// ensuring a reconnecting client always finds the existing hub with
		// its populated ring buffer during the grace window.
		if hubRaw, ok := h.hubs.LoadAndDelete(sessionID); ok {
			hubRaw.(*sessionHub).close()
		}
		h.sessions.Delete(sessionID)
		// Close readerDone so the orphaned PTY reader goroutine exits cleanly
		// instead of blocking on Read() until the PTY error propagates.
		if readerDone != nil {
			close(readerDone)
		}
		session.Close()
	})

	h.detachedSessions.Store(sessionID, ds)
	log.Printf("[Terminal] Session %s detached — PTY kept alive (grace: %v)", sessionID, gracePeriod)
}

// reattachSession retrieves a detached PTY session for reconnection.
// Returns the session if found and still alive, nil otherwise.
func (h *Handler) reattachSession(sessionID string) (*DetachedSession, bool) {
	value, ok := h.detachedSessions.LoadAndDelete(sessionID)
	if !ok {
		return nil, false
	}

	ds := value.(*DetachedSession)
	ds.graceTimer.Stop()

	// Stop the orphaned PTY reader goroutine from the previous handler.
	// Without this, two goroutines race to Read() from the same PTY fd,
	// splitting output and corrupting the terminal stream.
	if ds.readerDone != nil {
		close(ds.readerDone)
	}

	// Verify PTY is still alive
	if ds.session.IsDone() || ds.session.IsClosed() {
		log.Printf("[Terminal] Session %s: detached PTY already exited, cannot reattach", sessionID)
		ds.session.Close()
		return nil, false
	}

	log.Printf("[Terminal] Session %s: reattaching (was detached for %v)",
		sessionID, time.Since(ds.detachedAt))
	return ds, true
}

// connWriter wraps a websocket.Conn with a mutex for thread-safe writes.
// gorilla/websocket requires that only one goroutine calls write methods at a time.
type connWriter struct {
	conn   *websocket.Conn
	mu     sync.Mutex
	closed atomic.Bool
}

func (cw *connWriter) WriteMessage(messageType int, data []byte) error {
	if cw.closed.Load() {
		return fmt.Errorf("connection closed")
	}
	cw.mu.Lock()
	defer cw.mu.Unlock()
	// Increase deadline to 30s to handle slow clients without crashing
	_ = cw.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	err := cw.conn.WriteMessage(messageType, data)
	if err != nil {
		cw.closed.Store(true) // Mark as closed on any error
	}
	return err
}

func (cw *connWriter) WriteJSON(v interface{}) error {
	if cw.closed.Load() {
		return fmt.Errorf("connection closed")
	}
	cw.mu.Lock()
	defer cw.mu.Unlock()
	// Increase deadline to 30s to handle slow clients without crashing
	_ = cw.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	err := cw.conn.WriteJSON(v)
	if err != nil {
		cw.closed.Store(true) // Mark as closed on any error
	}
	return err
}

func (cw *connWriter) WriteControl(messageType int, data []byte, deadline time.Time) error {
	if cw.closed.Load() {
		return fmt.Errorf("connection closed")
	}
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return cw.conn.WriteControl(messageType, data, deadline)
}

func (cw *connWriter) markClosed() {
	cw.closed.Store(true)
}

// ResizeMessage represents a terminal resize request from the client.
type ResizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// VisionControlMessage represents vision control commands from client.
type VisionControlMessage struct {
	Type    string `json:"type"` // "VISION_ENABLE", "VISION_DISABLE", "INJECT_COMMAND"
	Command string `json:"command,omitempty"`
}

// VisionOverlayMessage represents vision overlay data sent to client.
type VisionOverlayMessage struct {
	Type        string                 `json:"type"` // "VISION_OVERLAY"
	OverlayType string                 `json:"overlayType"`
	Payload     map[string]interface{} `json:"payload"`
}

// ChatCommandMessage represents a Chat UI command to inject into PTY.
// v3.5.3: Enables Chat view to use the same PTY session as Terminal view.
type ChatCommandMessage struct {
	Type    string `json:"type"`    // "CHAT_COMMAND"
	Command string `json:"command"` // The command/message to inject
	CLI     string `json:"cli,omitempty"`   // "copilot" or "claude" - if set, wraps as CLI command
	Model   string `json:"model,omitempty"` // Model to use with CLI (from SLM routing)
}

// ImageAttachMessage represents an image attachment from clipboard paste.
// v3.7.2: Structured image attachment instead of sending raw text path.
type ImageAttachMessage struct {
	Type      string `json:"type"`      // "IMAGE_ATTACH"
	Path      string `json:"path"`      // Absolute path to image file
	Filename  string `json:"filename"`  // Original filename
	MimeType  string `json:"mimeType"`  // MIME type (e.g., "image/png")
	Size      int64  `json:"size"`      // File size in bytes
	Timestamp int64  `json:"timestamp"` // Unix timestamp (ms)
}

// ChatOutputMessage represents PTY output formatted for Chat display.
type ChatOutputMessage struct {
	Type      string `json:"type"`      // "CHAT_OUTPUT"
	Content   string `json:"content"`   // The output text
	IsPrompt  bool   `json:"isPrompt"`  // True if this looks like an interactive prompt
	Timestamp int64  `json:"timestamp"` // Unix timestamp
}

// PTYLogControlMessage represents PTY logging control commands from client.
type PTYLogControlMessage struct {
	Type    string `json:"type"`    // "PTY_LOG_ENABLE", "PTY_LOG_DISABLE", "PTY_LOG_GET"
	Enabled bool   `json:"enabled"` // For ENABLE/DISABLE
}

// GetPTYLogsForSession retrieves PTY logs for a session (for debug session export)
func GetPTYLogsForSession(sessionID string) []PTYLogEntry {
	return globalPTYLogger.GetLogs(sessionID)
}

// NewHandlerDirect creates a new terminal WebSocket handler with direct dependencies.
// v3.12.3: AM system removed - amSys parameter kept for API compatibility but ignored
func NewHandlerDirect(amSys interface{}, visionP *vision.Parser, llmDet *llm.Detector) *Handler {
	return &Handler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")

				// Allow localhost for local development
				if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
					return true
				}

				// Allow rootlevellabs.tech and all subdomains (Cloudflare ecosystem)
				if origin == "https://rootlevellabs.tech" || (strings.HasPrefix(origin, "https://") && strings.HasSuffix(origin, ".rootlevellabs.tech")) {
					return true
				}

				// Allow GitHub Pages deployments (github.io domain)
				if strings.Contains(origin, ".github.io") {
					return true
				}

				// Allow GitHub Codespaces
				if strings.Contains(origin, "app.github.dev") || strings.Contains(origin, ".csb.app") {
					return true
				}

				// Allow any origin for backward compatibility (can be restricted via ALLOWED_ORIGINS env var)
				return true
			},
			ReadBufferSize:  16384,
			WriteBufferSize: 16384,
		},
		visionParser: visionP,
		llmDetector:  llmDet,
	}
}

// GetVisionParser returns the vision parser for terminal vision overlay features.
func (h *Handler) GetVisionParser() *vision.Parser {
	return h.visionParser
}

// GetLLMDetector returns the LLM detector for detecting AI CLI tools.
func (h *Handler) GetLLMDetector() *llm.Detector {
	return h.llmDetector
}

// CloseAllSessions closes all active terminal sessions and returns the count.
// This is used for session restart without shutting down the server.
func (h *Handler) CloseAllSessions() int {
	// Set restart flag so HandleWebSocket knows to send CloseCodeSessionRestart
	h.restartRequested.Store(true)
	defer func() {
		// Clear flag after a short delay to ensure all close messages are sent
		time.Sleep(100 * time.Millisecond)
		h.restartRequested.Store(false)
	}()

	count := 0
	h.sessions.Range(func(key, value interface{}) bool {
		if session, ok := value.(*TerminalSession); ok {
			log.Printf("[Terminal] Closing session %s for restart", key)
			session.Close()
			count++
		}
		return true // continue iteration
	})

	// Also close any detached sessions (PTYs kept alive for reconnection)
	h.detachedSessions.Range(func(key, value interface{}) bool {
		if ds, ok := value.(*DetachedSession); ok {
			ds.graceTimer.Stop()
			if ds.readerDone != nil {
				close(ds.readerDone)
			}
			ds.session.Close()
			log.Printf("[Terminal] Closing detached session %s for restart", key)
			count++
		}
		h.detachedSessions.Delete(key)
		return true
	})

	log.Printf("[Terminal] Closed %d sessions for restart", count)
	return count
}

// SuspendSessions closes all sessions due to system sleep/hibernate.
// Uses CloseCodeSystemSleep (4004) so the frontend knows to reconnect
// with higher tolerance when the system wakes.
func (h *Handler) SuspendSessions() int {
	h.systemSleepRequested.Store(true)
	defer func() {
		time.Sleep(100 * time.Millisecond)
		h.systemSleepRequested.Store(false)
	}()

	count := 0
	h.sessions.Range(func(key, value interface{}) bool {
		if session, ok := value.(*TerminalSession); ok {
			log.Printf("[Terminal] Closing session %s for system sleep", key)
			session.Close()
			count++
		}
		return true
	})

	// Also close any detached sessions
	h.detachedSessions.Range(func(key, value interface{}) bool {
		if ds, ok := value.(*DetachedSession); ok {
			ds.graceTimer.Stop()
			if ds.readerDone != nil {
				close(ds.readerDone)
			}
			ds.session.Close()
			log.Printf("[Terminal] Closing detached session %s for system sleep", key)
			count++
		}
		h.detachedSessions.Delete(key)
		return true
	})

	log.Printf("[Terminal] Suspended %d sessions for system sleep", count)
	return count
}

// GetSession retrieves a terminal session by ID.
// Returns the session and true if found, nil and false otherwise.
// Used by injection handlers and other session management features.
func (h *Handler) GetSession(sessionID string) (*TerminalSession, bool) {
	value, ok := h.sessions.Load(sessionID)
	if !ok {
		return nil, false
	}
	session, ok := value.(*TerminalSession)
	return session, ok
}

// RangeSessions iterates over all active sessions.
// The callback receives the session ID; return false to stop iteration.
func (h *Handler) RangeSessions(fn func(id string) bool) {
	h.sessions.Range(func(key, _ interface{}) bool {
		if id, ok := key.(string); ok {
			return fn(id)
		}
		return true
	})
}

// DetachedSessionCount returns the number of PTY sessions currently in the
// grace-period waiting room (disconnected but not yet reaped).
func (h *Handler) DetachedSessionCount() int {
	count := 0
	h.detachedSessions.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

// HubCount returns the number of active session hubs.
// Each hub corresponds to one live PTY; multiple clients may share a hub.
func (h *Handler) HubCount() int {
	count := 0
	h.hubs.Range(func(_, _ interface{}) bool {
		count++
		return true
	})
	return count
}

// TestPTYSpawn attempts to create and immediately destroy a PTY session using
// the default shell configuration. It returns nil on success or an error that
// explains exactly why PTY creation failed — the same error a real terminal
// connection would hit. Used by the internal diagnostics endpoint to surface
// spawn failures that don't show up in simpler health checks.
func (h *Handler) TestPTYSpawn() error {
	session, err := NewTerminalSessionWithConfig("_diag_pty_probe_", nil)
	if err != nil {
		return err
	}
	_ = session.Close()
	return nil
}

// HandleWebSocket upgrades the HTTP connection to WebSocket and manages PTY I/O.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade to WebSocket
	rawConn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Terminal] Failed to upgrade connection: %v", err)
		return
	}
	defer rawConn.Close()

	// Allow large messages (up to 1MB) — mobile sends long prompts as single frames
	rawConn.SetReadLimit(1024 * 1024)

	// Wrap connection for thread-safe writes
	// gorilla/websocket is NOT thread-safe for concurrent writes
	conn := &connWriter{conn: rawConn}
	// NOTE: conn.markClosed() is called in the session hub defer below.

	// Parse shell config from query params
	query := r.URL.Query()
	shellConfig := &ShellConfig{
		ShellType:   query.Get("shell"),
		WSLDistro:   query.Get("distro"),
		WSLHomePath: query.Get("wslHome"),
		CmdHomePath: query.Get("cmdHome"),
		PSHomePath:  query.Get("psHome"),
	}

	// Get tabID from query params (for AM/LLM logging)
	// If not provided, fall back to WebSocket session ID
	tabID := query.Get("tabId")
	if tabID == "" {
		tabID = uuid.New().String()
		log.Printf("[Terminal] Warning: No tabID provided, using session ID: %s", tabID)
	}

	// Parse initial terminal dimensions from query params.
	// TUI apps (e.g. Copilot CLI) query the PTY size at startup; if the PTY is
	// created at 80x24 and resized later the app caches a wrong layout.
	initialCols := uint16(80)
	initialRows := uint16(24)
	if c, err := strconv.ParseUint(query.Get("cols"), 10, 16); err == nil && c > 0 {
		initialCols = uint16(c)
	}
	if r2, err := strconv.ParseUint(query.Get("rows"), 10, 16); err == nil && r2 > 0 {
		initialRows = uint16(r2)
	}

	// Create terminal session with config — or join a live one, or reattach a detached one.
	sessionID := tabID // Use tabID as session ID for consistency

	// ── HUB: one hub per sessionID, shared across all concurrent clients ──
	freshHub := newSessionHub()
	hubRaw, hubLoaded := h.hubs.LoadOrStore(sessionID, freshHub)
	hub := hubRaw.(*sessionHub)
	if !hubLoaded {
		// Newly created hub — open the session journal and restore prior
		// scrollback into the ring buffer so reconnecting clients don't see
		// a blank screen even if the server was restarted.
		hub.journal = NewSessionJournal(sessionID)
		// Restore the terminal keyboard/private-mode state for this session. The
		// persisted sidecar carries the modes a TUI set at startup even after they
		// were trimmed from the scrollback journal — this is what lets a recovered
		// tab's xterm re-sync with the still-running TUI so digits/arrows work.
		hub.modeTracker.SetPersistPath(sessionModesPath(sessionID))
		hub.modeTracker.LoadPersisted(sessionModesPath(sessionID))
		if prior := hub.journal.ReadAll(); len(prior) > 0 {
			hub.mu.Lock()
			hub.appendToRingLocked(prior)
			hub.mu.Unlock()
			// Observe the replayed scrollback too, so any mode changes still present
			// in the (un-trimmed) journal update the state on top of the sidecar.
			hub.modeTracker.Observe(prior)
			log.Printf("[Terminal] Session %s: ring buffer seeded from journal (%d bytes)", sessionID, len(prior))
		}
	}
	// Replay scrollback BEFORE adding to the hub so the client receives all
	// historical output before any new PTY data arrives via broadcast. Adding
	// to the hub first would allow broadcast() to race with replayTo(),
	// interleaving new output with the scrollback.
	hub.replayTo(conn, websocket.BinaryMessage)
	hub.add(conn)

	var session *TerminalSession
	var isReattach bool
	var isWatcher bool // true when joining a PTY that is already owned by another connection

	// Priority 1: Live session (another connection already owns the PTY).
	// Join as a watcher: share PTY output via hub, send input normally.
	if liveVal, ok := h.sessions.Load(sessionID); ok {
		live := liveVal.(*TerminalSession)
		if !live.IsClosed() && !live.IsDone() {
			session = live
			isWatcher = true
			log.Printf("[Terminal] Session %s: client joining live session (hub size now %d)", sessionID, hub.size())

			// If this session is also in detachedSessions (the previous handler
			// disconnected and detached it, but the session is still alive), clean
			// up the detach state: stop the grace timer and close readerDone so
			// the orphaned PTY reader goroutine exits. Without this, the old
			// goroutine keeps reading from the PTY fd, racing with the new one.
			if dsVal, dsOk := h.detachedSessions.LoadAndDelete(sessionID); dsOk {
				ds := dsVal.(*DetachedSession)
				ds.graceTimer.Stop()
				if ds.readerDone != nil {
					close(ds.readerDone)
				}
				log.Printf("[Terminal] Session %s: cleaned up detached state (client rejoined live session)", sessionID)
			}

			// Scrollback was already replayed before hub.add() above.

			// If no LIVE device currently controls this PTY (previous owner
			// disconnected, or the recorded controller's socket already failed a
			// write), auto-promote this client to active so it can resize and
			// interact fully. Checking liveness — not just presence — prevents a
			// dead socket from demoting every rejoining tab to a passive viewer.
			if !hub.hasLiveActive() {
				hub.setActive(conn)
				log.Printf("[Terminal] Session %s: auto-promoted joining client to active (no previous active)", sessionID)
				_ = conn.WriteJSON(map[string]interface{}{
					"type":           "SESSION_JOINED",
					"sessionId":      sessionID,
					"isActiveDevice": true,
				})
			} else {
				_ = conn.WriteJSON(map[string]interface{}{
					"type":           "SESSION_JOINED",
					"sessionId":      sessionID,
					"isActiveDevice": false,
				})
			}
		}
	}

	if !isWatcher {
		// Acquire a per-sessionID lock to prevent two simultaneous WebSocket
		// upgrades from creating duplicate PTY processes for the same tab.
		lockRaw, _ := h.sessionCreateLocks.LoadOrStore(sessionID, &sync.Mutex{})
		sessionLock := lockRaw.(*sync.Mutex)
		sessionLock.Lock()

		// Re-check for a live session — another goroutine may have created
		// one while we were waiting for the lock.
		if liveVal, ok := h.sessions.Load(sessionID); ok {
			live := liveVal.(*TerminalSession)
			if !live.IsClosed() && !live.IsDone() {
				session = live
				isWatcher = true
				sessionLock.Unlock()
				log.Printf("[Terminal] Session %s: became watcher after lock (another goroutine created it)", sessionID)
				// Liveness check (not just presence): a dead controller socket
				// must not force this client into passive-viewer mode.
				shouldPromoteJoiner := !hub.hasLiveActive()
				_ = conn.WriteJSON(map[string]interface{}{
					"type":           "SESSION_JOINED",
					"sessionId":      sessionID,
					"isActiveDevice": shouldPromoteJoiner,
				})
				if shouldPromoteJoiner {
					hub.setActive(conn)
				}
			}
		}

		if !isWatcher {
			// Priority 2: Detached session (PTY survived a previous disconnect).
			if ds, ok := h.reattachSession(sessionID); ok {
				session = ds.session
				isReattach = true
				sessionLock.Unlock()
				log.Printf("[Terminal] Session %s reattached (shell was detached for %v)",
					sessionID, time.Since(ds.detachedAt))
				_ = conn.WriteJSON(map[string]interface{}{
					"type":             "SESSION_REATTACHED",
					"sessionId":        sessionID,
					"detachedDuration": time.Since(ds.detachedAt).Seconds(),
				})
			} else {
				// Priority 3: New session.
				var err error
				session, err = NewTerminalSessionWithConfig(sessionID, shellConfig)
				sessionLock.Unlock()
				if err != nil {
					log.Printf("[Terminal] Failed to create session %s: %v", sessionID, err)
					_ = conn.WriteJSON(map[string]string{"error": "Failed to create terminal session: " + err.Error()})
					// Send close code 4005 so the client knows this is a fatal spawn failure,
					// not a transient disconnect. The client stops retrying and shows the error.
					_ = conn.WriteControl(
						websocket.CloseMessage,
						websocket.FormatCloseMessage(CloseCodeSessionSpawnFailed, "PTY spawn failed"),
						time.Now().Add(2*time.Second))
					hub.remove(conn)
					// Clean up the zombie hub if we just created it and no other
					// clients are connected — prevents blank-screen reconnects.
					if !hubLoaded && hub.size() == 0 {
						h.hubs.Delete(sessionID)
						log.Printf("[Terminal] Session %s: cleaned up orphan hub after failed session creation", sessionID)
					}
					return
				}
				log.Printf("[Terminal] Session %s created (shell: %s, tabID: %s)", sessionID, shellConfig.ShellType, tabID)
			}
			h.sessions.Store(sessionID, session)
		}
	}

	// Compute grace period before the defer closure captures it
	gracePeriod := GracePeriodForClient(r.Header.Get("User-Agent"))

	// executiveTrigger is declared here (before the defer) so the closure can
	// read its final value at disconnect time for agent-aware grace periods.
	// It is assigned below inside the !isWatcher block.
	var executiveTrigger *ExecutiveTriggerHandler

	// readerDone is closed on reattach to stop this handler's PTY reader goroutine,
	// preventing two goroutines from racing on the same PTY fd after reconnection.
	readerDone := make(chan struct{})

	defer func() {
		conn.markClosed()
		hub.remove(conn)
		hub.clearActiveAndPromote(conn, sessionID) // auto-promote another client if this was the active device
		// Only detach the session when the last client leaves.
		// While any client remains in the hub, the PTY goroutine keeps broadcasting to them.
		//
		// CRITICAL: Do NOT delete the hub or session from the maps here.
		// The reconnecting client (same tabId/sessionID) needs to find the
		// EXISTING hub with its populated ring buffer and open journal.
		// If we delete them, the reconnecting handler creates a BRAND NEW hub
		// with an empty ring buffer, causing the user to see a blank terminal
		// even though the PTY was successfully reattached.
		//
		// Instead, we keep the hub and session in the maps and let the grace
		// timer clean them up if no client reconnects in time.
		if hub.size() == 0 {
			// Guard: session is nil when PTY creation failed — nothing to detach.
			if session == nil {
				return
			}
			// Extend the grace period when an AI agent is actively running —
			// the agent may still be working and the user will want to return.
			effectiveGrace := gracePeriod
			if executiveTrigger != nil {
				if proc := executiveTrigger.GetActiveProcess(); proc != nil {
					effectiveGrace = agentGracePeriod
					log.Printf("[Terminal] Session %s: agent (%s) active — extending PTY grace to %v",
						sessionID, proc.Provider, agentGracePeriod)
				}
			}
			h.detachSession(sessionID, session, effectiveGrace, readerDone)
		}
	}()

	// Flag: set to false when PTY exits or session is intentionally ended.
	// When true, the defer's detachSession() will keep the PTY alive.
	// When false (PTY exited), detachSession() detects IsDone() and closes immediately.
	// This is a documentation hint — the actual decision is in detachSession().

	// Set initial terminal size using client-reported dimensions (or 80x24 fallback)
	// Only the active device may resize the PTY.
	// For new sessions and reattaches, the client is always active.
	// For watchers joining a live session, they're active only if auto-promoted
	// (no other active device exists — previous owner disconnected).
	if !isWatcher {
		hub.setActive(conn) // new session or reattach → this client owns the PTY
	}
	if hub.isActive(conn) {
		_ = session.Resize(initialCols, initialRows)
	}
	sizeSource := "default"
	if query.Get("cols") != "" {
		sizeSource = "client"
	}
	switch {
	case isWatcher:
		log.Printf("[Terminal] Session %s: watcher joined (no resize, active device controls PTY)", sessionID)
	case isReattach:
		log.Printf("[Terminal] Reattached session resized to %dx%d (from %s)", initialCols, initialRows, sizeSource)
	default:
		log.Printf("[Terminal] Initial size: %dx%d (from %s)", initialCols, initialRows, sizeSource)
	}

	// ── Owner-only state: prompt detection, vision insights ──
	// Watchers share the PTY output via the hub; they don't need separate state machines.
	var visionParser *vision.Parser
	var promptDetector *PromptDetector
	var chatResponsePending atomic.Bool
	var insightsTracker *vision.InsightsTracker
	var lineBuffer *LineBuffer
	var smartRoutingEnabled atomic.Bool

	if !isWatcher {
		// Get Vision parser using getter method (supports both direct and assistantCore)
		visionParser = h.GetVisionParser()

		// v3.5.3: PromptDetector for Chat PTY bridge response detection
		promptDetector = NewPromptDetector()
		promptDetector.SetHeuristicMode(true) // Enable heuristic fallback for non-integrated shells

		// Set up prompt detection callbacks for Chat bridge
		promptDetector.OnResponseComplete(func(response string) {
			if chatResponsePending.Load() {
				log.Printf("[ChatBridge] Response complete detected (%d chars)", len(response))
				_ = conn.WriteJSON(map[string]interface{}{
					"type":      "CHAT_RESPONSE_COMPLETE",
					"response":  response,
					"timestamp": time.Now().UnixMilli(),
				})
				chatResponsePending.Store(false)
			}
		})

		promptDetector.OnWaitingForInput(func(promptText string) {
			log.Printf("[PromptDetector] Waiting for input detected: %s", promptText)
			_ = conn.WriteJSON(map[string]interface{}{
				"type":       "PROMPT_WAITING_FOR_INPUT",
				"promptText": promptText,
				"timestamp":  time.Now().UnixMilli(),
			})
		})

		promptDetector.OnStateChange(func(old, new PromptState) {
			_ = conn.WriteJSON(map[string]interface{}{
				"type":      "PROMPT_STATE_CHANGE",
				"oldState":  old.String(),
				"newState":  new.String(),
				"timestamp": time.Now().UnixMilli(),
			})
		})

		// Launch async initialization for vision insights only
		go func() {
			cwd, _ := os.Getwd()
			sessionInfo := vision.SessionInfo{
				TabID:      tabID,
				WorkingDir: cwd,
				ShellType:  shellConfig.ShellType,
				InAutoMode: false,
			}
			insightsTracker = vision.NewInsightsTracker("", sessionInfo)
			visionParser.SetInsightsTracker(insightsTracker)
			log.Printf("[Terminal] Vision insights tracker initialized for session %s", sessionID)
		}()

		_ = h.GetLLMDetector() // Keep for backward compatibility

		executiveTrigger = NewExecutiveTriggerHandler(visionParser)
		lineBuffer = NewLineBuffer()
		smartRoutingEnabled.Store(true) // Enabled by default
	} // end owner-only setup

	var inputBuffer strings.Builder // shared by WS read goroutine for all connection types

	// Channel to coordinate shutdown with reason
	type closeReason struct {
		code   int
		reason string
	}
	closeChan := make(chan closeReason, 1)
	done := make(chan struct{})
	var closeOnce sync.Once

	// ═══ WEBSOCKET KEEPALIVE (CRITICAL FOR IDLE CONNECTIONS) ═══
	// Configure ping/pong to prevent idle disconnects
	// Browsers and proxies often close idle WebSockets after 60-120 seconds
	const (
		pingPeriod = 15 * time.Second  // Send ping every 15 seconds (was 30s — too slow for some proxies)
		pongWait   = 45 * time.Second  // Wait up to 45 seconds for pong response
	)
	
	// Set up pong handler - client must respond to our pings
	rawConn.SetReadDeadline(time.Now().Add(pongWait))
	rawConn.SetPongHandler(func(string) error {
		// Reset the read deadline on pong receipt - connection is alive
		rawConn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	
	// Ping goroutine - sends periodic pings to keep connection alive
	go func() {
		ticker := time.NewTicker(pingPeriod)
		defer ticker.Stop()
		
		for {
			select {
			case <-ticker.C:
				// Send ping with deadline
				if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(10*time.Second)); err != nil {
					log.Printf("[Terminal] Ping failed for session %s: %v", sessionID, err)
					// Connection is dead, trigger close
					select {
					case closeChan <- closeReason{1006, "Ping failed"}:
					default:
					}
					return
				}
			case <-done:
				return
			}
		}
	}()

	// v3.5.3: Periodically check for quiescence (for heuristic prompt detection)
	if !isWatcher {
		go func() {
			ticker := time.NewTicker(50 * time.Millisecond)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					promptDetector.CheckQuiescence()
				case <-done:
					return
				}
			}
		}()

	}

	// PTY -> WebSocket (owner only).
	// Watchers join the hub and receive broadcasts from this goroutine.
	// On reattach, the new handler closes readerDone to stop this goroutine
	// and starts a fresh one, avoiding two goroutines racing on the same PTY fd.
	if !isWatcher {
		go func() {
			defer closeOnce.Do(func() { close(done) })
		buf := make([]byte, 4096)
		var messageCount int64
		var totalWriteTime time.Duration
		var maxWriteTime time.Duration
		lastStatsReport := time.Now()
		
		for {
			// Check if this reader has been superseded by a reattaching handler.
			// This must be checked BEFORE the blocking Read() to exit promptly
			// when the signal arrives between iterations.
			select {
			case <-readerDone:
				log.Printf("[Terminal] Session %s: PTY reader goroutine stopped (session reattached)", sessionID)
				return
			default:
			}

			// FREEZE INSTRUMENTATION: Time PTY reads
			readStart := time.Now()
			n, err := session.Read(buf)
			readDuration := time.Since(readStart)

			// After waking from a blocking Read, check readerDone again.
			// If a new handler reattached while we were blocked, flush any data
			// we read before exiting — otherwise those bytes are silently lost.
			select {
			case <-readerDone:
				if n > 0 {
					hub.broadcast(websocket.BinaryMessage, buf[:n])
				}
				log.Printf("[Terminal] Session %s: PTY reader goroutine stopped after read (session reattached, flushed %d bytes)", sessionID, n)
				return
			default:
			}
			
			// v3.9.1: Increase threshold to 500ms to reduce log noise
			if readDuration > 500*time.Millisecond {
				log.Printf("[FREEZE-DEBUG] Slow PTY read: %v for %d bytes", readDuration, n)
			}
			// v3.9.8: Detect critically slow reads that indicate problems
			if readDuration > 5*time.Second {
				log.Printf("[FREEZE-CRITICAL] PTY read blocked for %v - possible hang", readDuration)
			}
			
			if err != nil {
				log.Printf("[Terminal] PTY read error: %v", err)
				select {
				case closeChan <- closeReason{CloseCodePTYError, "Terminal read error"}:
				default:
				}
				return
			}
			if n > 0 {
				messageCount++
				
				// PTY LOGGING: Log bytes read from PTY (for Follow Me debugger)
				// Check for both session-specific and global active session logging
				activeDebugSession := GetActiveDebugSession()
				isFollowMeActive := globalPTYLogger.IsEnabled(sessionID) || 
					(activeDebugSession != "" && globalPTYLogger.IsEnabled(activeDebugSession))

				if isFollowMeActive {
					// Log to the sessionID (tabID) stream
					if globalPTYLogger.IsEnabled(sessionID) {
						globalPTYLogger.LogPTY(sessionID, "from_pty", buf[:n])
					}
					// Also log to the global active session stream if different
					if activeDebugSession != "" && activeDebugSession != sessionID && globalPTYLogger.IsEnabled(activeDebugSession) {
						globalPTYLogger.LogPTY(activeDebugSession, "from_pty", buf[:n])
					}
				}
				
				// ═══ CRITICAL PERFORMANCE: Broadcast to all hub clients FIRST ═══
				// This ensures terminal output is immediately visible to every viewer.

				// FREEZE INSTRUMENTATION: Time hub broadcast
				writeStart := time.Now()
				hub.broadcast(websocket.BinaryMessage, buf[:n])
				writeDuration := time.Since(writeStart)

				// Track cumulative stats
				totalWriteTime += writeDuration
				if writeDuration > maxWriteTime {
					maxWriteTime = writeDuration
				}

				// v3.9.1: Increase threshold to 200ms to reduce log noise
				if writeDuration > 200*time.Millisecond {
					log.Printf("[FREEZE-DEBUG] Slow hub broadcast: %v for %d bytes", writeDuration, n)
				}
				if writeDuration > 500*time.Millisecond {
					log.Printf("[FREEZE-CRITICAL] Hub broadcast blocked for %v - %d bytes", writeDuration, n)
				}

				// Periodic stats report (every 30 seconds)
				if time.Since(lastStatsReport) > 30*time.Second {
					avgWrite := time.Duration(0)
					if messageCount > 0 {
						avgWrite = totalWriteTime / time.Duration(messageCount)
					}
					log.Printf("[FREEZE-STATS] Messages: %d, AvgWrite: %v, MaxWrite: %v", messageCount, avgWrite, maxWriteTime)
					lastStatsReport = time.Now()
				}

				// v3.5.3: Feed output to prompt detector for Chat bridge
				promptDetector.ProcessOutput(buf[:n])

				// Vision: Feed data SYNCHRONOUSLY - no goroutine spawn
				// Spawning goroutines per chunk caused unbounded growth and freezes
				if visionParser.Enabled() {
					if match := visionParser.Feed(buf[:n]); match != nil {
						// Special handling for detected URLs - we want to analyze them immediately
						// and if they are images, inject a vision summary back into the PTY context
						if match.Type == "URL_DETECTED" {
							if url, ok := match.Payload["url"].(string); ok {
								log.Printf("[Vision] Image URL detected: %s", url)
								// Notify frontend to fetch/display if needed
								_ = conn.WriteJSON(VisionOverlayMessage{
									Type:        "VISION_OVERLAY",
									OverlayType: "IMAGE_URL_DETECTED",
									Payload:     match.Payload,
								})
								
								// Async fetch and analyze to avoid blocking PTY
								go func(imageUrl string) {
									// Here we would download and analyze.
									// For now, we inject a marker that the multimodal bridge can pick up.
									// In a full implementation, we'd call an LLM here.
									// For now, we just ensure the URL is highlighted as a "Vision Object"
									
									// If we had the image analysis, we'd do:
									// summary := analyzeImage(imageUrl)
									// visionParser.SetLastImageSummary(summary)
								}(url)
							}
						} else {
							overlayMsg := VisionOverlayMessage{
								Type:        "VISION_OVERLAY",
								OverlayType: match.Type,
								Payload:     match.Payload,
							}
							// Best effort write - log error but don't crash
							if err := conn.WriteJSON(overlayMsg); err != nil {
								log.Printf("[Terminal] Vision overlay write failed: %v", err)
							}
						}
					}
				}

				// v3.12.3: AM pipeline removed
			}
		}
	}()
	} // end if !isWatcher — PTY goroutine
	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			msgType, data, err := rawConn.ReadMessage() // Reads don't need mutex
			if err != nil {
				log.Printf("[Terminal] WebSocket read error: %v", err)
				// Report the unexpected disconnect so the server sends a proper
				// close code (1001 "Going Away") instead of defaulting to 1000.
				// Without this, pong timeouts send code 1000 and the frontend
				// doesn't attempt reconnection.
				select {
				case closeChan <- closeReason{1001, "Connection lost"}:
				default:
				}
				return
			}

			// Check if it's a control message (JSON)
			if msgType == websocket.TextMessage {
				var msg ResizeMessage
				if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
					// Only the active device may resize the PTY.
					if !hub.isActive(conn) {
						log.Printf("[Terminal] Ignoring resize from non-active device (%dx%d)", msg.Cols, msg.Rows)
						continue
					}
					// Validate dimensions to prevent nonsensical PTY sizes
					if msg.Cols < 10 || msg.Cols > 500 || msg.Rows < 2 || msg.Rows > 200 {
						log.Printf("[Terminal] Ignoring invalid resize %dx%d", msg.Cols, msg.Rows)
						continue
					}
					if err := session.Resize(msg.Cols, msg.Rows); err != nil {
						log.Printf("[Terminal] Resize error: %v", err)
					} else {
						log.Printf("[Terminal] Resized to %dx%d", msg.Cols, msg.Rows)
					}
					continue
				}

				// Handle "take_control" — any client can request to become the active device.
				// This enables the Spotify-style handoff: phone takes over from PC and vice versa.
				if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "take_control" {
					log.Printf("[Terminal] Session %s: take_control requested (cols=%d, rows=%d)", sessionID, msg.Cols, msg.Rows)
					hub.transferControl(conn, sessionID)
					// Resize PTY to the new active device's dimensions
					if msg.Cols >= 10 && msg.Cols <= 500 && msg.Rows >= 2 && msg.Rows <= 200 {
						if err := session.Resize(msg.Cols, msg.Rows); err != nil {
							log.Printf("[Terminal] Resize after take_control error: %v", err)
						} else {
							log.Printf("[Terminal] Resized to %dx%d after take_control", msg.Cols, msg.Rows)
						}
					}
					continue
				}

				// Watchers skip all JSON control messages (vision, smart routing, chat, etc.)
				// but non-JSON text (raw terminal input from command cards) falls through to
				// the PTY write below — this allows remote viewers to type and run commands.
				if isWatcher {
					// If it parsed as JSON at all, it's a control message — drop it.
					var probe json.RawMessage
					if json.Unmarshal(data, &probe) == nil {
						log.Printf("[Terminal] Watcher %s: dropping JSON control message (%d bytes)", sessionID, len(data))
						continue
					}
					// Not JSON → raw terminal input (e.g. command card text or keyboard input).
					// Jump directly to PTY write, skipping owner-only processing.
					log.Printf("[Terminal] Watcher %s: forwarding raw input to PTY (%d bytes: %q)", sessionID, len(data), truncate(string(data), 32))
					if _, err := session.Write(data); err != nil {
						log.Printf("[Terminal] Watcher PTY write error: %v", err)
						select {
						case closeChan <- closeReason{CloseCodePTYError, "Terminal write error"}:
						default:
						}
						return
					}
					continue
				}
				var visionMsg VisionControlMessage
				if err := json.Unmarshal(data, &visionMsg); err == nil {
					switch visionMsg.Type {
					case "VISION_ENABLE":
						visionParser.SetEnabled(true)
						log.Printf("[Vision] Enabled for session %s", sessionID)
						continue
					case "VISION_DISABLE":
						visionParser.SetEnabled(false)
						visionParser.Clear()
						log.Printf("[Vision] Disabled for session %s", sessionID)
						continue
					case "INJECT_COMMAND":
						// Execute command in PTY (like git add <file>)
						if visionMsg.Command != "" {
							log.Printf("[Vision] Injecting command: %s", visionMsg.Command)
							if _, err := session.Write([]byte(visionMsg.Command + "\r")); err != nil {
								log.Printf("[Vision] Command injection error: %v", err)
							}
						}
						continue
					}
					// No match - fall through to other handlers
				}

				// Check for smart routing toggle control
				var routingMsg struct {
					Type    string `json:"type"`
					Enabled bool   `json:"enabled"`
				}
				if err := json.Unmarshal(data, &routingMsg); err == nil && routingMsg.Type == "SMART_ROUTING_TOGGLE" {
					smartRoutingEnabled.Store(routingMsg.Enabled)
					log.Printf("[SmartRouting] Smart routing set to %v for session %s", routingMsg.Enabled, sessionID)
					_ = conn.WriteJSON(map[string]interface{}{
						"type":    "SMART_ROUTING_CONFIRMED",
						"enabled": routingMsg.Enabled,
					})
					continue
				}

				// Check for PTY logging control messages (Follow Me debugger integration)
				var ptyLogMsg PTYLogControlMessage
				if err := json.Unmarshal(data, &ptyLogMsg); err == nil {
					switch ptyLogMsg.Type {
					case "PTY_LOG_ENABLE":
						globalPTYLogger.EnablePTYLogging(sessionID)
						_ = conn.WriteJSON(map[string]interface{}{
							"type":    "PTY_LOG_ENABLED",
							"enabled": true,
						})
						continue
					case "PTY_LOG_DISABLE":
						globalPTYLogger.DisablePTYLogging(sessionID)
						_ = conn.WriteJSON(map[string]interface{}{
							"type":    "PTY_LOG_DISABLED",
							"enabled": false,
						})
						continue
					case "PTY_LOG_GET":
						logs := globalPTYLogger.GetLogs(sessionID)
						logsJSON, err := json.Marshal(logs)
						if err != nil {
							log.Printf("[PTYLogger] Failed to marshal logs: %v", err)
							_ = conn.WriteJSON(map[string]interface{}{
								"type":  "PTY_LOG_ERROR",
								"error": err.Error(),
							})
						} else {
							_ = conn.WriteJSON(map[string]interface{}{
								"type": "PTY_LOG_DATA",
								"logs": json.RawMessage(logsJSON),
							})
						}
						continue
					}
				}

				// v3.5.3: Check for Chat command messages (Chat→PTY bridge)
				var chatMsg ChatCommandMessage
				if err := json.Unmarshal(data, &chatMsg); err != nil {
					// v3.9.1: Only log errors if data looks like JSON (starts with '{')
					if len(data) > 0 && data[0] == '{' {
						log.Printf("[ChatBridge] JSON parse error: %v", err)
					}
				} else if chatMsg.Type == "CHAT_COMMAND" {
					log.Printf("[ChatBridge] Received chat command for session %s: cli=%s, model=%s, cmd=%s", 
						sessionID, chatMsg.CLI, chatMsg.Model, truncate(chatMsg.Command, 50))
					
					// Start response capture BEFORE sending command
					chatResponsePending.Store(true)
					promptDetector.StartResponseCapture()
					
					// Create bridge and inject command
					bridge := NewChatPTYBridge(session)
					
					if chatMsg.CLI != "" {
						// Wrap as CLI command with model selection
						if err := bridge.SendCLICommand(chatMsg.CLI, chatMsg.Model, chatMsg.Command); err != nil {
							log.Printf("[ChatBridge] CLI command error: %v", err)
							chatResponsePending.Store(false)
							_ = conn.WriteJSON(map[string]interface{}{
								"type":  "CHAT_ERROR",
								"error": err.Error(),
							})
						} else {
							_ = conn.WriteJSON(map[string]interface{}{
								"type":    "CHAT_COMMAND_SENT",
								"cli":     chatMsg.CLI,
								"model":   chatMsg.Model,
								"command": truncate(chatMsg.Command, 50),
							})
						}
					} else {
						// Direct message to PTY (for responding to prompts)
						if err := bridge.SendMessage(chatMsg.Command); err != nil {
							log.Printf("[ChatBridge] Message error: %v", err)
							chatResponsePending.Store(false)
							_ = conn.WriteJSON(map[string]interface{}{
								"type":  "CHAT_ERROR",
								"error": err.Error(),
							})
						} else {
							_ = conn.WriteJSON(map[string]interface{}{
								"type":    "CHAT_COMMAND_SENT",
								"command": truncate(chatMsg.Command, 50),
							})
						}
					}
					continue
				}

				// v3.7.2: Check for Image Attach messages (async image upload)
				var imgMsg ImageAttachMessage
				if err := json.Unmarshal(data, &imgMsg); err != nil {
					// v3.9.1: Only log errors if data looks like JSON (starts with '{')
					if len(data) > 0 && data[0] == '{' {
						log.Printf("[ImageAttach] JSON parse error: %v", err)
					}
				} else if imgMsg.Type == "IMAGE_ATTACH" {
					log.Printf("[ImageAttach] Received image for session %s: %s (%d bytes)", 
						sessionID, imgMsg.Filename, imgMsg.Size)
					
					// Send formatted path to PTY so CLI can access it
					// This maintains compatibility with existing Copilot/Claude behavior
					textToSend := fmt.Sprintf("[📷 %s]", imgMsg.Path)
					if _, err := session.Write([]byte(textToSend)); err != nil {
						log.Printf("[ImageAttach] PTY write error: %v", err)
						_ = conn.WriteJSON(map[string]interface{}{
							"type":  "IMAGE_ATTACH_ERROR",
							"error": err.Error(),
						})
					} else {
						// Send confirmation back to frontend
						_ = conn.WriteJSON(map[string]interface{}{
							"type":     "IMAGE_ATTACH_CONFIRMED",
							"filename": imgMsg.Filename,
							"path":     imgMsg.Path,
						})
						log.Printf("[ImageAttach] Image path sent to PTY: %s", imgMsg.Filename)
					}
					continue
				}
			}

			// ═══ EXECUTIVE TRIGGER: Check for "?" smart routing (owner only) ═══
			// Detect complete lines ending with Enter and check for "?" prefix
			if !isWatcher && smartRoutingEnabled.Load() && lineBuffer != nil {
				lines := lineBuffer.Add(data)
				for _, line := range lines {
					if IsExecutiveTrigger(line) {
						prompt := ExtractPrompt(line)
						log.Printf("[SmartRouting] Executive trigger detected: %s", prompt)

						// Handle the routing asynchronously with extended notification
						// Task 4: Badge shows what is ACTUALLY running
						go func(p string) {
							err := executiveTrigger.HandleWithExtendedNotify(p, session, func(n *RoutingNotification) {
								// Notify frontend of active routing with full context including SLM data
								_ = conn.WriteJSON(map[string]interface{}{
									"type":            "ROUTING_ACTIVE",
									"tier":            n.Tier,
									"toolName":        n.ToolName,
									"prompt":          n.Prompt,
									"tierMismatch":    n.TierMismatch,
									"actuallyRunning": n.ActuallyRunning,
									"previousTier":    n.PreviousTier,
									"action":          n.Action,
									// v3.12.3: Heuristic analysis data (SLM removed)
									"taskType":        n.TaskType,
								})
							})
							if err != nil {
								log.Printf("[SmartRouting] Routing error: %v", err)
								// Send error notification to frontend
								_ = conn.WriteJSON(map[string]interface{}{
									"type":    "ROUTING_ERROR",
									"error":   err.Error(),
									"prompt":  p,
								})
							}
						}(prompt)

						// Don't write the "?" line to PTY - we'll inject the routed command instead
						continue
					}
				}
			}

			// ═══ INPUT BUFFER ACCUMULATION (for LLM command detection) ═══
			// Accumulate keystrokes to detect full command lines for LLM injection
			dataStr := string(data)
			
			// BOUNDED BUFFER: Prevent OOM attacks
			if inputBuffer.Len() > 8192 { // 8KB limit
				inputBuffer.Reset()
			}
			
			// Filter out ANSI escape sequences before accumulating
			// This prevents escape codes from polluting command detection
			cleanStr := stripANSI(dataStr)
			inputBuffer.WriteString(cleanStr)
			
			// ═══ CRITICAL PERFORMANCE: Write to PTY ═══
			dataToWrite := data
			
			// Check if this is a command submission (contains newline)
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				// Reset buffer after command submission
				inputBuffer.Reset()
			}
			
			if _, err := session.Write(dataToWrite); err != nil {
				log.Printf("[Terminal] PTY write error: %v", err)
				select {
				case closeChan <- closeReason{CloseCodePTYError, "Terminal write error"}:
				default:
				}
				return
			}

			// PTY LOGGING: Log bytes sent to PTY (for Follow Me debugger)
			globalPTYLogger.LogPTY(sessionID, "to_pty", dataToWrite)
		}
	}()

	// Wait for shutdown or session termination
	var finalReason closeReason
	select {
	case <-done:
		log.Printf("[Terminal] Session %s: I/O loop ended", sessionID)
		select {
		case finalReason = <-closeChan:
		default:
			// Belt-and-suspenders: if closeChan is empty (shouldn't happen now
			// that the WS read goroutine reports 1001), use 1001 "Going Away"
			// instead of 1000. Code 1000 causes the frontend to NOT reconnect.
			finalReason = closeReason{1001, "Connection lost"}
		}
	case <-session.Done():
		// PTY process exited — close the session to prevent detach attempt
		if h.systemSleepRequested.Load() {
			log.Printf("[Terminal] Session %s: Closed for system sleep", sessionID)
			finalReason = closeReason{CloseCodeSystemSleep, "System is going to sleep"}
		} else if h.restartRequested.Load() {
			log.Printf("[Terminal] Session %s: Restarting (server still running)", sessionID)
			finalReason = closeReason{CloseCodeSessionRestart, "Session restarted"}
		} else {
			log.Printf("[Terminal] Session %s: Process exited", sessionID)
			finalReason = closeReason{CloseCodePTYExited, "Shell process exited"}
		}
		// Mark session closed so detachSession won't try to keep a dead PTY alive
		session.Close()
	case <-time.After(24 * time.Hour):
		log.Printf("[Terminal] Session %s: Timeout (24h)", sessionID)
		finalReason = closeReason{CloseCodeTimeout, "Session timed out after 24 hours"}
		session.Close()
	}

	// v3.12.3: AM LLM logger cleanup removed

	// Send close message with reason
	closeMessage := websocket.FormatCloseMessage(finalReason.code, finalReason.reason)
	_ = conn.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
}
