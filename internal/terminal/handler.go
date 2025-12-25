// Package terminal provides WebSocket terminal handler.
package terminal

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// Custom WebSocket close codes (4000-4999 range is for application use)
const (
	CloseCodePTYExited = 4000 // Shell process exited normally
	CloseCodeTimeout   = 4001 // Session timed out
	CloseCodePTYError  = 4002 // PTY read/write error
)

// Handler manages WebSocket terminal connections.
type Handler struct {
	upgrader     websocket.Upgrader
	sessions     sync.Map // map[string]*TerminalSession
	amSystem     *am.System
	visionParser *vision.Parser
	llmDetector  *llm.Detector
}

// connWriter wraps a websocket.Conn with a mutex for thread-safe writes.
// gorilla/websocket requires that only one goroutine calls write methods at a time.
type connWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (cw *connWriter) WriteMessage(messageType int, data []byte) error {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return cw.conn.WriteMessage(messageType, data)
}

func (cw *connWriter) WriteJSON(v interface{}) error {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return cw.conn.WriteJSON(v)
}

func (cw *connWriter) WriteControl(messageType int, data []byte, deadline time.Time) error {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return cw.conn.WriteControl(messageType, data, deadline)
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

// NewHandlerDirect creates a new terminal WebSocket handler with direct dependencies.
// This is the new constructor that doesn't depend on assistant.Core wrapper.
func NewHandlerDirect(amSys *am.System, visionP *vision.Parser, llmDet *llm.Detector) *Handler {
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
		amSystem:     amSys,
		visionParser: visionP,
		llmDetector:  llmDet,
	}
}

// GetVisionParser returns the vision parser for terminal vision overlay features.
func (h *Handler) GetVisionParser() *vision.Parser {
	return h.visionParser
}

// GetAMSystem returns the AM (Artificial Memory) system for LLM logging.
func (h *Handler) GetAMSystem() *am.System {
	return h.amSystem
}

// GetLLMDetector returns the LLM detector for detecting AI CLI tools.
func (h *Handler) GetLLMDetector() *llm.Detector {
	return h.llmDetector
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

	// Create terminal session with config
	sessionID := tabID // Use tabID as session ID for consistency
	session, err := NewTerminalSessionWithConfig(sessionID, shellConfig)
	if err != nil {
		log.Printf("[Terminal] Failed to create session: %v", err)
		_ = conn.WriteJSON(map[string]string{"error": "Failed to create terminal session: " + err.Error()})
		return
	}
	defer func() {
		session.Close()
		h.sessions.Delete(sessionID)
	}()

	h.sessions.Store(sessionID, session)
	log.Printf("[Terminal] Session %s created (shell: %s, tabID: %s)", sessionID, shellConfig.ShellType, tabID)

	// Set initial terminal size (default 80x24)
	_ = session.Resize(80, 24)

	// Get Vision parser using getter method (supports both direct and assistantCore)
	visionParser := h.GetVisionParser()

	// STANDALONE AUTO-RESPOND DETECTOR (independent of AM)
	autoRespondDetector := NewAutoRespondDetector("github-copilot")
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

	// PERFORMANCE FIX: Initialize AM/Vision/LLM systems asynchronously
	// These don't need to block the terminal from becoming interactive
	var llmLoggerAtomic atomic.Value // Stores *am.LLMLogger - lock-free concurrent access
	var insightsTracker *vision.InsightsTracker
	amSystem := h.GetAMSystem()

	// Launch async initialization - doesn't block terminal readiness
	go func() {
		if amSystem != nil {
			llmLogger := amSystem.GetLLMLogger(tabID)
			llmLoggerAtomic.Store(llmLogger)
			if llmLogger != nil {
				activeConv := llmLogger.GetActiveConversationID()
				log.Printf("[Terminal] Using LLM logger for tabID: %s, activeConv: %s", tabID, activeConv)
			} else {
				log.Printf("[Terminal] NO LLM logger available for tabID: %s", tabID)
			}
			// Record PTY heartbeat for Layer 1
			if amSystem.HealthMonitor != nil {
				amSystem.HealthMonitor.RecordPTYHeartbeat()
			}

			// Initialize Vision Insights tracker
			cwd, _ := os.Getwd()
			sessionInfo := vision.SessionInfo{
				TabID:      tabID,
				WorkingDir: cwd,
				ShellType:  shellConfig.ShellType,
				InAutoMode: false, // Will be updated when auto-respond starts
			}
			insightsTracker = vision.NewInsightsTracker(amSystem.AMDir, sessionInfo)
			visionParser.SetInsightsTracker(insightsTracker)
			log.Printf("[Terminal] Vision insights tracker initialized for session %s", sessionID)

			// Set up low-confidence callback for AM v2.0
			// When parsing confidence is low during auto-respond, notify user via Vision
			if logger := llmLoggerAtomic.Load(); logger != nil {
				llmLogger := logger.(*am.LLMLogger)
				if llmLogger != nil {
					llmLogger.SetLowConfidenceCallback(func(raw string) {
						log.Printf("[AM] Low confidence parsing detected, sending Vision notification")
						// Send a Vision overlay to notify the user
						overlayMsg := VisionOverlayMessage{
							Type:        "VISION_OVERLAY",
							OverlayType: "AM_LOW_CONFIDENCE",
							Payload: map[string]interface{}{
								"message":     "AM detected low-confidence parsing. Raw data preserved for manual review.",
								"severity":    "warning",
								"autoRespond": true,
								"rawLength":   len(raw),
							},
						}
						if err := conn.WriteJSON(overlayMsg); err != nil {
							log.Printf("[AM] Failed to send low-confidence notification: %v", err)
						}
					})
				}
			}
			log.Printf("[Terminal] Session %s: AM system initialized with tabID %s", sessionID, tabID)
		}
	}()

	detector := h.GetLLMDetector()
	var inputBuffer strings.Builder
	var amInputAccumulator strings.Builder // Batch AM input checks
	lastAMCheck := time.Now()
	var llmOutputBuffer strings.Builder // Buffer for LLM logger to reduce lock contention
	const flushTimeout = 2 * time.Second
	lastFlushCheck := time.Now()
	lastLLMFlush := time.Now()

	// Channel to coordinate shutdown with reason
	type closeReason struct {
		code   int
		reason string
	}
	closeChan := make(chan closeReason, 1)
	done := make(chan struct{})
	var closeOnce sync.Once

	// Layer 1: PTY Heartbeat - Send periodic heartbeats for health monitoring
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				if amSystem != nil && amSystem.HealthMonitor != nil {
					amSystem.HealthMonitor.RecordPTYHeartbeat()
				}
			case <-done:
				return
			}
		}
	}()

	// Subscribe to AM EventBus for Assistant events
	unsubscribe := am.EventBus.Subscribe(func(event *am.LayerEvent) {
		// Only forward events for this tab
		if event.TabID != "" && event.TabID != tabID {
			return
		}

		// Only forward assistant events (Layer 2)
		if event.Layer != 2 {
			return
		}

		// Send to WebSocket
		// Note: conn.WriteJSON is thread-safe via mutex
		conn.WriteJSON(map[string]interface{}{
			"type":      event.Type,
			"timestamp": event.Timestamp,
			"metadata":  event.Metadata,
			"tabId":     event.TabID,
		})
	})
	defer unsubscribe()

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
			if readDuration > 100*time.Millisecond {
				log.Printf("[FREEZE-DEBUG] Slow PTY read: %v for %d bytes", readDuration, n)
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
				
				if writeDuration > 50*time.Millisecond {
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

				// Vision: Feed data SYNCHRONOUSLY - no goroutine spawn
				// Spawning goroutines per chunk caused unbounded growth and freezes
				if visionParser.Enabled() {
					if match := visionParser.Feed(buf[:n]); match != nil {
						overlayMsg := VisionOverlayMessage{
							Type:        "VISION_OVERLAY",
							OverlayType: match.Type,
							Payload:     match.Payload,
						}
						conn.WriteJSON(overlayMsg) // Best effort, ignore errors
					}
				}

				// Feed output to LLM logger - THROTTLED to reduce CPU load
				// Accumulate output and flush every 200ms to prevent lock contention
				if logger := llmLoggerAtomic.Load(); logger != nil {
					llmLogger := logger.(*am.LLMLogger)
					if llmLogger != nil && llmLogger.GetActiveConversationID() != "" {
						// BOUNDED BUFFER: Prevent OOM
						if llmOutputBuffer.Len() > 65536 { // 64KB limit
							llmOutputBuffer.Reset()
						}
						llmOutputBuffer.Write(buf[:n])
						now := time.Now()
						if now.Sub(lastLLMFlush) > 200*time.Millisecond {
							lastLLMFlush = now
							if llmOutputBuffer.Len() > 0 {
								llmLogger.AddOutput(llmOutputBuffer.String())
								llmOutputBuffer.Reset()
							}
						}
					}
				}
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
					case "VISION_DISABLE":
						visionParser.SetEnabled(false)
						visionParser.Clear()
						log.Printf("[Vision] Disabled for session %s", sessionID)
					case "INJECT_COMMAND":
						// Execute command in PTY (like git add <file>)
						if visionMsg.Command != "" {
							log.Printf("[Vision] Injecting command: %s", visionMsg.Command)
							if _, err := session.Write([]byte(visionMsg.Command + "\r")); err != nil {
								log.Printf("[Vision] Command injection error: %v", err)
							}
						}
					}
					continue
				}

				// Check for AM control messages (auto-respond state sync)
				var amMsg AMControlMessage
				if err := json.Unmarshal(data, &amMsg); err == nil && amMsg.Type == "AM_AUTO_RESPOND" {
					if logger := llmLoggerAtomic.Load(); logger != nil {
						if llmLogger := logger.(*am.LLMLogger); llmLogger != nil {
							llmLogger.SetAutoRespond(amMsg.AutoRespond)
							log.Printf("[AM] Auto-respond set to %v for session %s", amMsg.AutoRespond, sessionID)
						}
					}
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

			// AUTO-RESPOND: Process input for state detection
			autoRespondDetector.ProcessInput(data)

			// Accumulate input for LLM detection (after PTY write)
			dataStr := string(data)
			
			// BOUNDED BUFFER: Prevent OOM attacks
			if inputBuffer.Len() > 8192 { // 8KB limit
				inputBuffer.Reset()
			}
			inputBuffer.WriteString(dataStr)

			// AM: Capture user input when inside active LLM session
			// Batch checks to avoid main thread contention (100ms intervals)
			if amInputAccumulator.Len() > 8192 { // 8KB limit
				amInputAccumulator.Reset()
			}
			amInputAccumulator.WriteString(dataStr)
			if time.Since(lastAMCheck) > 100*time.Millisecond {
				if logger := llmLoggerAtomic.Load(); logger != nil {
					llmLogger := logger.(*am.LLMLogger)
					if llmLogger != nil && llmLogger.GetActiveConversationID() != "" {
						llmLogger.AddUserInput(amInputAccumulator.String())
					}
				}
				amInputAccumulator.Reset()
				lastAMCheck = time.Now()
			}

			// Check for newline/enter (command submission)
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				commandLine := strings.TrimSpace(inputBuffer.String())
				inputBuffer.Reset()

				if logger := llmLoggerAtomic.Load(); commandLine != "" && logger != nil {
					llmLogger := logger.(*am.LLMLogger)
					if llmLogger != nil {
						// Only detect new LLM command if no conversation is active
						activeConv := llmLogger.GetActiveConversationID()
						if activeConv == "" {
							detected := detector.DetectCommand(commandLine)

							if detected.Detected {
								// Check if this is a TUI-based tool (Copilot, Claude)
								isTUITool := detected.Provider == "github-copilot" || detected.Provider == "claude"

								if isTUITool {
									llmLogger.StartConversationFromProcess(
										string(detected.Provider),
										string(detected.Type),
										0,
									)
								} else {
									llmLogger.StartConversation(detected)
								}
							}
						}
					}
				}
			}

			// Periodic flush check for LLM output (reduced frequency)
			if logger := llmLoggerAtomic.Load(); logger != nil {
				llmLogger := logger.(*am.LLMLogger)
				if llmLogger != nil && time.Since(lastFlushCheck) > flushTimeout {
					if llmLogger.ShouldFlushOutput(flushTimeout) {
						go llmLogger.FlushOutput() // Async flush
					}
					lastFlushCheck = time.Now()
				}
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
		log.Printf("[Terminal] Session %s: Process exited", sessionID)
		finalReason = closeReason{CloseCodePTYExited, "Shell process exited"}
	case <-time.After(24 * time.Hour):
		log.Printf("[Terminal] Session %s: Timeout (24h)", sessionID)
		finalReason = closeReason{CloseCodeTimeout, "Session timed out after 24 hours"}
	}

	// CRITICAL: Clean up LLM logger when session ends
	if logger := llmLoggerAtomic.Load(); logger != nil {
		llmLogger := logger.(*am.LLMLogger)
		if llmLogger != nil {
			// End any active conversation
			if activeConv := llmLogger.GetActiveConversationID(); activeConv != "" {
				log.Printf("[Terminal] Ending active conversation %s on session close", activeConv)
				llmLogger.EndConversation()
			}
			// Remove the logger from global map to prevent memory leaks
			am.RemoveLLMLogger(tabID)
			log.Printf("[Terminal] LLM logger cleaned up for tab %s", tabID)
		}
	}

	// Send close message with reason
	closeMessage := websocket.FormatCloseMessage(finalReason.code, finalReason.reason)
	_ = conn.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
}
