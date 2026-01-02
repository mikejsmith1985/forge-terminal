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

	// Get amEnabled status from query params
	amEnabledStr := query.Get("amEnabled")
	amEnabled := amEnabledStr == "true"
	log.Printf("[Terminal] Tab %s AM enabled: %v", tabID, amEnabled)

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

	// PERFORMANCE FIX: Initialize AM/Vision/LLM systems asynchronously
	// These don't need to block the terminal from becoming interactive
	var llmLoggerAtomic atomic.Value // Stores *am.LLMLogger - lock-free concurrent access
	var insightsTracker *vision.InsightsTracker
	amSystem := h.GetAMSystem()

	// Launch async initialization - doesn't block terminal readiness
	go func() {
		if amSystem != nil && amEnabled {
			log.Printf("[Terminal] AM is ENABLED for tab %s - initializing LLM Logger", tabID)
			llmLogger := am.GetLLMLogger(tabID, amSystem.AMDir)
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
			
			// v3.5.3: Hook PromptDetector to end conversations when shell prompt returns
			// This provides more accurate conversation boundaries than pattern matching
			promptDetector.OnPromptDetected(func() {
				llmLogger := llmLoggerAtomic.Load()
				if llmLogger == nil {
					return
				}
				if logger, ok := llmLogger.(*am.LLMLogger); ok && logger != nil {
					activeConv := logger.GetActiveConversationID()
					if activeConv != "" {
						log.Printf("[PromptDetector→AM] Shell prompt detected, ending conversation %s", activeConv)
						logger.EndConversation()
					}
				}
			})
			
			log.Printf("[Terminal] Session %s: AM system initialized with tabID %s", sessionID, tabID)
		} else if amSystem != nil && !amEnabled {
			log.Printf("[Terminal] AM is DISABLED for tab %s - skipping LLM Logger initialization", tabID)
		} else {
			log.Printf("[Terminal] AM system is nil for tab %s", tabID)
		}
	}()

	// NOTE: detector is kept but LLM detection now happens in async pipeline
	_ = h.GetLLMDetector() // Keep for backward compatibility
	var inputBuffer strings.Builder
	// Removed: amInputAccumulator, lastAMCheck, llmOutputBuffer, flushTimeout, lastFlushCheck, lastLLMFlush
	// These are now handled by the async pipeline in internal/am/async_pipeline.go

	// EXECUTIVE TRIGGER: Smart Model Routing via "?" prefix
	executiveTrigger := NewExecutiveTriggerHandler(visionParser)
	lineBuffer := NewLineBuffer()
	var smartRoutingEnabled atomic.Bool
	smartRoutingEnabled.Store(true) // Enabled by default

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
		if err := conn.WriteJSON(map[string]interface{}{
			"type":      event.Type,
			"timestamp": event.Timestamp,
			"metadata":  event.Metadata,
			"tabId":     event.TabID,
		}); err != nil {
			log.Printf("[Terminal] Failed to send AM event: %v", err)
		}
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
		lastReadTime := time.Now()
		const readTimeout = 30 * time.Second // Timeout for detecting hung PTY
		
		// Watchdog goroutine to detect hung PTY reads
		go func() {
			ticker := time.NewTicker(10 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					timeSinceRead := time.Since(lastReadTime)
					if timeSinceRead > readTimeout {
						log.Printf("[Terminal] CRITICAL: PTY read hung for %v - forcing close", timeSinceRead)
						select {
						case closeChan <- closeReason{CloseCodePTYError, "PTY read timeout"}:
						default:
						}
						return
					}
				case <-done:
					return
				}
			}
		}()
		
		for {
			// FREEZE INSTRUMENTATION: Time PTY reads
			readStart := time.Now()
			n, err := session.Read(buf)
			readDuration := time.Since(readStart)
			lastReadTime = time.Now() // Update watchdog
			
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

				// ═══ ASYNC PIPELINE: Non-blocking enqueue to AM system ═══
				// This prevents LLM logger from blocking the PTY read loop
				if amSystem != nil && amEnabled {
					// Non-blocking send - drops data if pipeline full (UI > logging)
					amSystem.EnqueueOutput(tabID, buf[:n])
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
									// v3.5.3: SLM analysis data
									"taskType":        n.TaskType,
									"complexity":      n.Complexity,
									"confidence":      n.Confidence,
									"usedSLM":         n.UsedSLM,
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

			// ═══ ASYNC PIPELINE: Non-blocking enqueue to AM system ═══
			// This prevents AM operations from blocking keyboard input
			if amSystem != nil && amEnabled {
				// Non-blocking send - drops data if pipeline full (UI > logging)
				amSystem.EnqueueInput(tabID, data)
			}

			// Check for newline/enter (command submission)
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				commandLine := strings.TrimSpace(inputBuffer.String())
				inputBuffer.Reset()

				// ═══ ASYNC PIPELINE: Enqueue command for LLM detection ═══
				if commandLine != "" && amSystem != nil && amEnabled {
					amSystem.EnqueueCommand(tabID, commandLine)
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
