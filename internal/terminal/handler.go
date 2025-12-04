// Package terminal provides WebSocket terminal handler.
package terminal

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
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

	// Channel to coordinate shutdown
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
				return
			}
			if n > 0 {
				err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				if err != nil {
					log.Printf("[Terminal] WebSocket write error: %v", err)
					return
				}
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

			// Regular input - write to PTY
			if _, err := session.Write(data); err != nil {
				log.Printf("[Terminal] PTY write error: %v", err)
				return
			}
		}
	}()

	// Wait for shutdown or session termination
	select {
	case <-done:
		log.Printf("[Terminal] Session %s: I/O loop ended", sessionID)
	case <-session.Done():
		log.Printf("[Terminal] Session %s: Process exited", sessionID)
	case <-time.After(24 * time.Hour):
		log.Printf("[Terminal] Session %s: Timeout (24h)", sessionID)
	}
}
