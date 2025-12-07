// Package terminal provides WebSocket terminal handler.
package terminal

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// Custom WebSocket close codes (4000-4999 range is for application use)
const (
	CloseCodePTYExited   = 4000 // Shell process exited normally
	CloseCodeTimeout     = 4001 // Session timed out
	CloseCodePTYError    = 4002 // PTY read/write error
)

// Handler manages WebSocket terminal connections.
type Handler struct {
	upgrader websocket.Upgrader
	sessions sync.Map // map[string]*TerminalSession
}

// ResizeMessage represents a terminal resize request from the client.
type ResizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// NewHandler creates a new terminal WebSocket handler.
func NewHandler() *Handler {
	return &Handler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in development
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// HandleWebSocket upgrades the HTTP connection to WebSocket and manages PTY I/O.
func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Terminal] Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	// Parse shell config from query params
	query := r.URL.Query()
	shellConfig := &ShellConfig{
		ShellType:   query.Get("shell"),
		WSLDistro:   query.Get("distro"),
		WSLHomePath: query.Get("home"),
	}

	// Create terminal session with config
	sessionID := uuid.New().String()
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
	log.Printf("[Terminal] Session %s created (shell: %s)", sessionID, shellConfig.ShellType)

	// Set initial terminal size (default 80x24)
	_ = session.Resize(80, 24)

	// Get LLM logger for this session (will be used if LLM commands detected)
	llmLogger := am.GetLLMLogger(sessionID)
	log.Printf("[Terminal] LLM logger initialized for session %s", sessionID)
	var inputBuffer strings.Builder
	const flushTimeout = 2 * time.Second
	lastFlushCheck := time.Now()

	// Channel to coordinate shutdown with reason
	type closeReason struct {
		code   int
		reason string
	}
	closeChan := make(chan closeReason, 1)
	done := make(chan struct{})
	var closeOnce sync.Once

	// PTY -> WebSocket (read from terminal, send to browser)
	go func() {
		defer closeOnce.Do(func() { close(done) })
		buf := make([]byte, 4096)
		for {
			n, err := session.Read(buf)
			if err != nil {
				log.Printf("[Terminal] PTY read error: %v", err)
				select {
				case closeChan <- closeReason{CloseCodePTYError, "Terminal read error"}:
				default:
				}
				return
			}
			if n > 0 {
				// Send output to browser
				err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				if err != nil {
					log.Printf("[Terminal] WebSocket write error: %v", err)
					return
				}

				// Check if we should flush LLM output (inactivity-based)
				if llmLogger.ShouldFlushOutput(flushTimeout) {
					log.Printf("[Terminal] Flush timeout reached, triggering flush")
					llmLogger.FlushOutput()
				}

				// Feed output to LLM logger if conversation is active
				activeConv := llmLogger.GetActiveConversationID()
				if activeConv != "" {
					log.Printf("[Terminal] Feeding %d bytes to LLM logger (activeConv=%s)", n, activeConv)
				}
				llmLogger.AddOutput(string(buf[:n]))
			}
		}
	}()

	// WebSocket -> PTY (read from browser, send to terminal)
	go func() {
		defer closeOnce.Do(func() { close(done) })
		for {
			msgType, data, err := conn.ReadMessage()
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
			}

			// Accumulate input for LLM detection
			dataStr := string(data)
			log.Printf("[Terminal] Received input data: %d bytes (contains newline: %v)", 
				len(dataStr), strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n"))
			inputBuffer.WriteString(dataStr)

			// Check for newline/enter (command submission)
			if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
				commandLine := strings.TrimSpace(inputBuffer.String())
				log.Printf("[Terminal] Newline detected, buffer contains: '%s' (length before trim: %d, after: %d)", 
					commandLine, inputBuffer.Len(), len(commandLine))
				inputBuffer.Reset()

				// Debug: Log all commands for inspection
				if commandLine != "" {
					log.Printf("[Terminal] Command entered: '%s' (length: %d, hex: %x)", 
						commandLine, len(commandLine), commandLine)
				} else {
					log.Printf("[Terminal] Empty command (just newline)")
				}

				// Detect if this is an LLM command
				detected := llm.DetectCommand(commandLine)
				log.Printf("[Terminal] LLM detection result: detected=%v provider=%s type=%s command='%s' rawInput='%s'", 
					detected.Detected, detected.Provider, detected.Type, commandLine, detected.RawInput)
				
				if detected.Detected {
					log.Printf("[Terminal] ✅ LLM command DETECTED: provider=%s type=%s", detected.Provider, detected.Type)
					log.Printf("[Terminal] Calling StartConversation...")
					convID := llmLogger.StartConversation(detected)
					log.Printf("[Terminal] ✅ StartConversation returned: %s", convID)
					
					// Verify the conversation was actually started
					if llmLogger.GetActiveConversationID() == convID {
						log.Printf("[Terminal] ✅ VERIFIED: Active conversation set to %s", convID)
					} else {
						log.Printf("[Terminal] ❌ ERROR: Active conversation is '%s', expected '%s'", 
							llmLogger.GetActiveConversationID(), convID)
					}
				} else {
					log.Printf("[Terminal] ❌ Not an LLM command: '%s'", commandLine)
				}
			}

			// Periodic flush check for LLM output
			if time.Since(lastFlushCheck) > flushTimeout {
				log.Printf("[Terminal] Periodic flush check (last check: %v ago)", time.Since(lastFlushCheck))
				if llmLogger.ShouldFlushOutput(flushTimeout) {
					log.Printf("[Terminal] ShouldFlushOutput=true, calling FlushOutput")
					llmLogger.FlushOutput()
				} else {
					log.Printf("[Terminal] ShouldFlushOutput=false, skipping flush")
				}
				lastFlushCheck = time.Now()
			}

			// Regular input - write to PTY
			if _, err := session.Write(data); err != nil {
				log.Printf("[Terminal] PTY write error: %v", err)
				select {
				case closeChan <- closeReason{CloseCodePTYError, "Terminal write error"}:
				default:
				}
				return
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

	// Send close message with reason
	closeMessage := websocket.FormatCloseMessage(finalReason.code, finalReason.reason)
	_ = conn.WriteControl(websocket.CloseMessage, closeMessage, time.Now().Add(time.Second))
}
