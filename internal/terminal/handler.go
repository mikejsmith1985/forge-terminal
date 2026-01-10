// Package terminal provides WebSocket terminal handler.
package terminal

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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
	CloseCodePTYExited       = 4000 // Shell process exited normally
	CloseCodeTimeout         = 4001 // Session timed out
	CloseCodePTYError        = 4002 // PTY read/write error
	CloseCodeSessionRestart  = 4003 // All sessions restarted (server still running)
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
	upgrader        websocket.Upgrader
	sessions        sync.Map // map[string]*TerminalSession
	visionParser    *vision.Parser
	llmDetector     *llm.Detector
	restartRequested atomic.Bool // Flag to indicate session restart is in progress
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

// AMControlMessage represents AM control commands from client.
type AMControlMessage struct {
	Type        string `json:"type"` // "AM_AUTO_RESPOND"
	AutoRespond bool   `json:"autoRespond"`
}

// AutoRespondControlMessage represents standalone auto-respond control.
type AutoRespondControlMessage struct {
	Type    string `json:"type"` // "AUTO_RESPOND_TOGGLE"
	Enabled bool   `json:"enabled"`
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

// PromptInjectionControlMessage configures persistent prompt injection.
type PromptInjectionControlMessage struct {
	Type        string `json:"type"`        // "PROMPT_INJECTION_CONFIG"
	Enabled     bool   `json:"enabled"`     // Enable/Disable injection
	Instruction string `json:"instruction"` // The instruction to append on every prompt
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
				// Check allowed origins for GitHub Pages deployment support
				origin := r.Header.Get("Origin")

				// Allow localhost for local development
				if strings.HasPrefix(origin, "http://localhost") || strings.HasPrefix(origin, "http://127.0.0.1") {
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
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
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
	log.Printf("[Terminal] Closed %d sessions for restart", count)
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

// HandleWebSocket upgrades the HTTP connection to WebSocket and manages PTY I/O.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade to WebSocket
	rawConn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Terminal] Failed to upgrade connection: %v", err)
		return
	}
	defer rawConn.Close()

	// Wrap connection for thread-safe writes
	// gorilla/websocket is NOT thread-safe for concurrent writes
	conn := &connWriter{conn: rawConn}
	defer conn.markClosed() // Ensure closed flag is set on exit

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

	// v3.12.3: AM system removed - amEnabled param ignored

	// Create terminal session with config
	sessionID := tabID // Use tabID as session ID for consistency
	session, err := NewTerminalSessionWithConfig(sessionID, shellConfig)
	if err != nil {
		log.Printf("[Terminal] Failed to create session: %v", err)
		_ = conn.WriteJSON(map[string]string{"error": "Failed to create terminal session: " + err.Error()})
		return
	}
	h.sessions.Store(sessionID, session)
	log.Printf("[Terminal] Session %s created (shell: %s, tabID: %s)", sessionID, shellConfig.ShellType, tabID)

	defer func() {
		session.Close()
		// RACE CONDITION FIX: Only delete if the map still holds THIS session
		// This prevents deleting a NEW session if a reconnection happened quickly
		h.sessions.CompareAndDelete(sessionID, session)
	}()

	// Set initial terminal size (default 80x24)
	_ = session.Resize(80, 24)

	// Get Vision parser using getter method (supports both direct and assistantCore)
	visionParser := h.GetVisionParser()

	// v3.5.3: PromptDetector for Chat PTY bridge response detection
	promptDetector := NewPromptDetector()
	promptDetector.SetHeuristicMode(true) // Enable heuristic fallback for non-integrated shells
	var chatResponsePending atomic.Bool
	
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
			"promptText": promptText, // v3.7.1: Include prompt text for chat UI
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

	// PRECISION AUTO-RESPONDER v2.0 (independent of AM)
	// Uses EchoBuffer to filter user echo and SequenceEngine for action chains
	ptyWriter := func(data []byte) error {
		_, err := session.Write(data)
		return err
	}
	// v3.5.3: Use shared PromptDetector for unified detection across AutoRespond, AM, and Chat
	autoRespondDetector := NewAutoRespondDetectorWithPromptDetector("github-copilot", ptyWriter, promptDetector)
	var autoRespondEnabled atomic.Bool
	autoRespondDetector.SetCallbacks(
		func() {
			// Callback when waiting for user input
			if autoRespondEnabled.Load() {
				log.Printf("[AutoRespond] Detected: Waiting for user input")
				_ = conn.WriteJSON(map[string]interface{}{
					"type":      "AUTO_RESPOND_STATE",
					"state":     "waiting_for_user",
					"timestamp": time.Now(),
				})
			}
		},
		func() {
			// Callback when assistant is responding
			if autoRespondEnabled.Load() {
				log.Printf("[AutoRespond] Detected: Assistant responding")
				_ = conn.WriteJSON(map[string]interface{}{
					"type":      "AUTO_RESPOND_STATE",
					"state":     "assistant_responding",
					"timestamp": time.Now(),
				})
			}
		},
	)

	// v3.12.3: AM system removed - simplified initialization
	var insightsTracker *vision.InsightsTracker

	// Launch async initialization for vision insights only
	go func() {
		// Initialize Vision Insights tracker (doesn't depend on AM)
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

	// NOTE: detector is kept but LLM detection now happens in async pipeline
	_ = h.GetLLMDetector() // Keep for backward compatibility
	var inputBuffer strings.Builder
	// v3.12.3: AM removed - input/output logging disabled

	// EXECUTIVE TRIGGER: Smart Model Routing via "?" prefix
	executiveTrigger := NewExecutiveTriggerHandler(visionParser)
	lineBuffer := NewLineBuffer()
	var smartRoutingEnabled atomic.Bool
	smartRoutingEnabled.Store(true) // Enabled by default

	// PERSISTENT PROMPT INJECTION STATE
	var injectionEnabled bool
	var persistentPrompt string

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
		pingPeriod = 30 * time.Second  // Send ping every 30 seconds
		pongWait   = 60 * time.Second  // Wait up to 60 seconds for pong response
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

	// v3.12.3: AM EventBus subscription removed

	// AUTO-RESPOND: Periodic check for state changes
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if autoRespondDetector.Check() {
					// State changed to waiting for user
					log.Printf("[AutoRespond] State check: Waiting for user input detected")
				}
			case <-done:
				return
			}
		}
	}()

	// PTY -> WebSocket (read from terminal, send to browser)
	go func() {
		defer closeOnce.Do(func() { close(done) })
		buf := make([]byte, 4096)
		var messageCount int64
		var totalWriteTime time.Duration
		var maxWriteTime time.Duration
		lastStatsReport := time.Now()
		
		for {
			// FREEZE INSTRUMENTATION: Time PTY reads
			readStart := time.Now()
			n, err := session.Read(buf)
			readDuration := time.Since(readStart)
			
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
				
				// ═══ CRITICAL PERFORMANCE: Send to browser FIRST ═══
				// This ensures terminal output is immediately visible
				
				// FREEZE INSTRUMENTATION: Time WebSocket writes
				writeStart := time.Now()
				err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				writeDuration := time.Since(writeStart)
				
				// Track cumulative stats
				totalWriteTime += writeDuration
				if writeDuration > maxWriteTime {
					maxWriteTime = writeDuration
				}
				
				// v3.9.1: Increase threshold to 200ms to reduce log noise
				if writeDuration > 200*time.Millisecond {
					log.Printf("[FREEZE-DEBUG] Slow WebSocket write: %v for %d bytes", writeDuration, n)
				}
				if writeDuration > 500*time.Millisecond {
					log.Printf("[FREEZE-CRITICAL] WebSocket write blocked for %v - %d bytes", writeDuration, n)
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
				
				if err != nil {
					log.Printf("[Terminal] WebSocket write error: %v", err)
					return
				}

				// AUTO-RESPOND: Process output for state detection
				autoRespondDetector.ProcessOutput(buf[:n])

				// v3.5.3: Feed output to prompt detector for Chat bridge
				promptDetector.ProcessOutput(buf[:n])

				// Vision: Feed data SYNCHRONOUSLY - no goroutine spawn
				// Spawning goroutines per chunk caused unbounded growth and freezes
				if visionParser.Enabled() {
					if match := visionParser.Feed(buf[:n]); match != nil {
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

				// v3.12.3: AM pipeline removed
			}
		}
	}()

	// WebSocket -> PTY (read from browser, send to terminal)
	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			msgType, data, err := rawConn.ReadMessage() // Reads don't need mutex
			if err != nil {
				log.Printf("[Terminal] WebSocket read error: %v", err)
				return
			}

			// Check if it's a control message (JSON)
			if msgType == websocket.TextMessage {
				var msg ResizeMessage
				if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
					if err := session.Resize(msg.Cols, msg.Rows); err != nil {
						log.Printf("[Terminal] Resize error: %v", err)
					} else {
						log.Printf("[Terminal] Resized to %dx%d", msg.Cols, msg.Rows)
					}
					continue
				}

				// Check for Vision control messages
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

				// Check for AM control messages (auto-respond state sync)
				// v3.12.3: AM removed - skip AM_AUTO_RESPOND messages
				var amMsg AMControlMessage
				if err := json.Unmarshal(data, &amMsg); err == nil && amMsg.Type == "AM_AUTO_RESPOND" {
					log.Printf("[Terminal] v3.12.3: AM_AUTO_RESPOND message ignored (AM removed)")
					continue
				}

				// Check for standalone auto-respond control (independent of AM)
				var autoRespondMsg AutoRespondControlMessage
				if err := json.Unmarshal(data, &autoRespondMsg); err == nil && autoRespondMsg.Type == "AUTO_RESPOND_TOGGLE" {
					autoRespondDetector.SetEnabled(autoRespondMsg.Enabled)
					autoRespondEnabled.Store(autoRespondMsg.Enabled)
					log.Printf("[AutoRespond] Standalone auto-respond set to %v for session %s", autoRespondMsg.Enabled, sessionID)
					
					// Send confirmation back to client
					_ = conn.WriteJSON(map[string]interface{}{
						"type":    "AUTO_RESPOND_CONFIRMED",
						"enabled": autoRespondMsg.Enabled,
						"stats":   autoRespondDetector.GetStats(),
					})
					continue
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

				// Check for PROMPT INJECTION CONFIG
				var promptMsg PromptInjectionControlMessage
				if err := json.Unmarshal(data, &promptMsg); err == nil && promptMsg.Type == "PROMPT_INJECTION_CONFIG" {
					injectionEnabled = promptMsg.Enabled
					persistentPrompt = promptMsg.Instruction
					log.Printf("[PromptInjection] Configured for session %s: Enabled=%v, Instruction length=%d",
						sessionID, injectionEnabled, len(persistentPrompt))

					// Send confirmation back to client
					_ = conn.WriteJSON(map[string]interface{}{
						"type":        "PROMPT_INJECTION_CONFIRMED",
						"enabled":     injectionEnabled,
						"instruction": persistentPrompt,
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

			// ═══ EXECUTIVE TRIGGER: Check for "?" smart routing ═══
			// Detect complete lines ending with Enter and check for "?" prefix
			if smartRoutingEnabled.Load() {
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

			// ═══ PERSISTENT PROMPT INJECTION ═══
			// Automatically inject instructions on Enter, but ONLY if enabled and in main buffer
			if injectionEnabled && persistentPrompt != "" {
				dataStr := string(data)
				// Check for Enter key (submission)
				if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
					// SAFETY: Only inject if we are in the main buffer (CLI mode)
					// This prevents accidental injection into Vim/Nano/Htop (Alternate Buffer)
					if !promptDetector.IsAlternateBuffer() {
						log.Printf("[PromptInjection] Injecting persistent instruction (%d chars)", len(persistentPrompt))

						// Append instruction before the newline so it becomes part of the command
						if strings.Contains(dataStr, "\r") {
							dataStr = strings.ReplaceAll(dataStr, "\r", " "+persistentPrompt+"\r")
						} else {
							dataStr = strings.ReplaceAll(dataStr, "\n", " "+persistentPrompt+"\n")
						}
						data = []byte(dataStr)
					} else {
						log.Printf("[PromptInjection] Skipped: Alternate buffer (TUI) detected")
					}
				}
			}

			// ═══ CRITICAL PERFORMANCE: Write to PTY FIRST, process later ═══
			// This ensures keyboard input is immediately responsive
			if _, err := session.Write(data); err != nil {
				log.Printf("[Terminal] PTY write error: %v", err)
				select {
				case closeChan <- closeReason{CloseCodePTYError, "Terminal write error"}:
				default:
				}
				return
			}

			// PTY LOGGING: Log bytes sent to PTY (for Follow Me debugger)
			globalPTYLogger.LogPTY(sessionID, "to_pty", data)

			// AUTO-RESPOND: Process input for state detection
			autoRespondDetector.ProcessInput(data)

			// Accumulate input for LLM detection (after PTY write)
			dataStr := string(data)
			
			// BOUNDED BUFFER: Prevent OOM attacks
			if inputBuffer.Len() > 8192 { // 8KB limit
				inputBuffer.Reset()
			}
			inputBuffer.WriteString(dataStr)

			// v3.12.3: AM pipeline removed

			// Check for newline/enter (command submission)
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				commandLine := strings.TrimSpace(inputBuffer.String())
				inputBuffer.Reset()

				// v3.12.3: AM command enqueue removed
				_ = commandLine // Silence unused warning
			}
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
			finalReason = closeReason{websocket.CloseNormalClosure, "Connection closed"}
		}
	case <-session.Done():
		// Check if this is a restart or normal exit
		if h.restartRequested.Load() {
			log.Printf("[Terminal] Session %s: Restarting (server still running)", sessionID)
			finalReason = closeReason{CloseCodeSessionRestart, "Session restarted"}
		} else {
			log.Printf("[Terminal] Session %s: Process exited", sessionID)
			finalReason = closeReason{CloseCodePTYExited, "Shell process exited"}
		}
	case <-time.After(24 * time.Hour):
		log.Printf("[Terminal] Session %s: Timeout (24h)", sessionID)
		finalReason = closeReason{CloseCodeTimeout, "Session timed out after 24 hours"}
	}

	// v3.12.3: AM LLM logger cleanup removed

	// Send close message with reason
	closeMessage := websocket.FormatCloseMessage(finalReason.code, finalReason.reason)
	_ = conn.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
}
