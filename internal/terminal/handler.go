// Package forge provides WebSocket terminal handler for the Forge application.
// It enables full PTY terminal access via WebSocket for Claude Code CLI support.
package forge

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// TerminalHandler manages WebSocket terminal connections.
type TerminalHandler struct {
	upgrader     websocket.Upgrader
	sessions     sync.Map // map[string]*TerminalSession
	portalClient *PortalClient
}

// ResizeMessage represents a terminal resize request from the client.
type ResizeMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// NewTerminalHandler creates a new terminal WebSocket handler.
func NewTerminalHandler() *TerminalHandler {
	// Get Portal URL from environment or use default
	portalURL := os.Getenv("PORTAL_URL")
	if portalURL == "" {
		portalURL = "http://localhost:8080" // Default to same host (modular monolith)
	}

	return &TerminalHandler{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // Allow all origins in development
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
		portalClient: NewPortalClient(portalURL),
	}
}

// RegisterRoutes registers the terminal WebSocket endpoint on a Gin router group.
// The group should have SessionAuthMiddleware applied for protected routes.
func (h *TerminalHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/ws/forge/terminal", h.HandleTerminal)
	router.GET("/api/forge/config", h.HandleGetConfig)
	router.POST("/api/forge/uploads", h.HandleUploadImage)
	router.DELETE("/api/forge/uploads", h.HandleClearUploads)
}

// RegisterProtectedRoutes registers routes that require authentication.
// Use this with a router group that has SessionAuthMiddleware applied.
func (h *TerminalHandler) RegisterProtectedRoutes(group *gin.RouterGroup) {
	group.GET("/terminal", h.HandleTerminal)
	group.GET("/config", h.HandleGetConfig)
	group.POST("/uploads", h.HandleUploadImage)
	group.DELETE("/uploads", h.HandleClearUploads)
}

// WorkspaceConfig represents the terminal workspace configuration.
type WorkspaceConfig struct {
	WorkspacePath      string `json:"workspace_path"`       // Host path (e.g., /home/mike/projects)
	WorkspaceMountPath string `json:"workspace_mount_path"` // Container path (e.g., /workspace)
	IsConfigured       bool   `json:"is_configured"`        // Whether workspace is mounted
	UsingFallback      bool   `json:"using_fallback"`       // True if using WebSocket file fallback
}

// HandleGetConfig returns the Forge terminal configuration including workspace path.
func (h *TerminalHandler) HandleGetConfig(c *gin.Context) {
	workspacePath := GetWorkspacePath()
	mountPath := os.Getenv("WORKSPACE_MOUNT_PATH")
	if mountPath == "" {
		mountPath = "/workspace"
	}

	// Check if workspace is actually mounted with content
	usingFallback := true
	if info, err := os.Stat(mountPath); err == nil && info.IsDir() {
		entries, _ := os.ReadDir(mountPath)
		if len(entries) > 0 {
			usingFallback = false
		}
	}

	config := WorkspaceConfig{
		WorkspacePath:      workspacePath,
		WorkspaceMountPath: mountPath,
		IsConfigured:       workspacePath != "",
		UsingFallback:      usingFallback,
	}

	c.JSON(http.StatusOK, config)
}

// HandleTerminal upgrades the HTTP connection to WebSocket and manages PTY I/O.
func (h *TerminalHandler) HandleTerminal(c *gin.Context) {
	// Get user ID from context (set by auth middleware)
	userID := 0
	if uid, exists := c.Get("user_id"); exists {
		if id, ok := uid.(int); ok {
			userID = id
		}
	}

	// Pre-upgrade auth check: return JSON error for unauthenticated users
	// This allows frontend to show "Click to login" link instead of broken WebSocket
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":     "auth_required",
			"message":   "Please log in to access the terminal",
			"login_url": "/auth/github/login",
		})
		return
	}

	// Get session token from context (set by auth middleware) for fetching API keys
	sessionToken := ""
	if tok, exists := c.Get("session_token"); exists {
		if t, ok := tok.(string); ok {
			sessionToken = t
		}
	}

	// Also try to get from cookie directly
	if sessionToken == "" {
		if cookie, err := c.Cookie("devsmith_token"); err == nil && cookie != "" {
			sessionToken = cookie
			log.Printf("[Forge] Got session token from cookie (length: %d)", len(sessionToken))
		}
	} else {
		log.Printf("[Forge] Got session token from context (length: %d)", len(sessionToken))
	}

	// Try to get GitHub token directly from session context (set by middleware)
	githubTokenFromContext := ""
	if tok, exists := c.Get("github_token"); exists {
		if t, ok := tok.(string); ok {
			githubTokenFromContext = t
			log.Printf("[Forge] Got GitHub token from context (length: %d)", len(t))
		}
	}

	// Upgrade to WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[Forge] Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	// Fetch GitHub token for terminal session (for gh CLI and git operations)
	apiKeys := h.fetchGitHubToken(githubTokenFromContext)

	// Get custom working directory from query params (hot-swappable workspace)
	customWorkDir := c.Query("workdir")
	if customWorkDir != "" {
		log.Printf("[Forge] Client requested custom workdir: %s", customWorkDir)
	}

	// Create terminal session
	sessionID := uuid.New().String()
	session, err := NewTerminalSession(sessionID, userID, apiKeys, customWorkDir)
	if err != nil {
		log.Printf("[Forge] Failed to create session: %v", err)
		_ = conn.WriteJSON(map[string]string{"error": "Failed to create terminal session"})
		return
	}
	defer func() {
		session.Close()
		h.sessions.Delete(sessionID)
	}()

	h.sessions.Store(sessionID, session)
	log.Printf("[Forge] Session %s created for user %d", sessionID, userID)

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
				log.Printf("[Forge] PTY read error: %v", err)
				return
			}
			if n > 0 {
				err = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
				if err != nil {
					log.Printf("[Forge] WebSocket write error: %v", err)
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
				log.Printf("[Forge] WebSocket read error: %v", err)
				return
			}

			// Check if it's a control message (JSON)
			if msgType == websocket.TextMessage {
				var msg ResizeMessage
				if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
					if err := session.Resize(msg.Cols, msg.Rows); err != nil {
						log.Printf("[Forge] Resize error: %v", err)
					} else {
						log.Printf("[Forge] Resized to %dx%d", msg.Cols, msg.Rows)
					}
					continue
				}
			}

			// Regular input - write to PTY
			if _, err := session.Write(data); err != nil {
				log.Printf("[Forge] PTY write error: %v", err)
				return
			}
		}
	}()

	// Wait for shutdown or session termination
	select {
	case <-done:
		log.Printf("[Forge] Session %s: I/O loop ended", sessionID)
	case <-session.Done():
		log.Printf("[Forge] Session %s: Process exited", sessionID)
	case <-time.After(24 * time.Hour):
		log.Printf("[Forge] Session %s: Timeout (24h)", sessionID)
	}
}

// GetSession retrieves a session by ID (for future persistence support).
func (h *TerminalHandler) GetSession(sessionID string) (*TerminalSession, bool) {
	if s, ok := h.sessions.Load(sessionID); ok {
		session, _ := s.(*TerminalSession)
		return session, true
	}
	return nil, false
}

// UploadImageRequest represents the request body for image uploads.
type UploadImageRequest struct {
	ImageData string `json:"image_data" binding:"required"` // Base64-encoded image data
	MimeType  string `json:"mime_type" binding:"required"`  // MIME type (image/png, image/jpeg, etc.)
	Filename  string `json:"filename"`                      // Optional filename
}

// UploadImageResponse represents the response from image upload.
type UploadImageResponse struct {
	Path    string `json:"path"`    // Full path to uploaded file
	Success bool   `json:"success"` // Whether upload succeeded
	Error   string `json:"error"`   // Error message if failed
}

// getForgeUploadsDir returns the .forge-uploads directory path within workspace.
func (h *TerminalHandler) getForgeUploadsDir() string {
	mountPath := os.Getenv("WORKSPACE_MOUNT_PATH")
	if mountPath == "" {
		mountPath = "/workspace"
	}
	return filepath.Join(mountPath, ".forge-uploads")
}

// HandleUploadImage handles image upload from clipboard paste.
// POST /api/forge/uploads
func (h *TerminalHandler) HandleUploadImage(c *gin.Context) {
	var req UploadImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, UploadImageResponse{
			Success: false,
			Error:   "Invalid request: " + err.Error(),
		})
		return
	}

	// Validate MIME type
	validMimeTypes := map[string]string{
		"image/png":  ".png",
		"image/jpeg": ".jpg",
		"image/gif":  ".gif",
		"image/webp": ".webp",
		"image/bmp":  ".bmp",
	}
	ext, ok := validMimeTypes[req.MimeType]
	if !ok {
		c.JSON(http.StatusBadRequest, UploadImageResponse{
			Success: false,
			Error:   fmt.Sprintf("Unsupported image type: %s", req.MimeType),
		})
		return
	}

	// Decode base64 image data
	imageData, err := base64.StdEncoding.DecodeString(req.ImageData)
	if err != nil {
		c.JSON(http.StatusBadRequest, UploadImageResponse{
			Success: false,
			Error:   "Invalid base64 data: " + err.Error(),
		})
		return
	}

	// Check file size (max 10MB)
	const maxSize = 10 * 1024 * 1024
	if len(imageData) > maxSize {
		c.JSON(http.StatusBadRequest, UploadImageResponse{
			Success: false,
			Error:   fmt.Sprintf("Image too large: %d bytes (max %d)", len(imageData), maxSize),
		})
		return
	}

	// Create uploads directory if it doesn't exist
	uploadsDir := h.getForgeUploadsDir()
	//nolint:gosec // G301: 0755 is intentional for user workspace directories
	if err := os.MkdirAll(uploadsDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, UploadImageResponse{
			Success: false,
			Error:   "Failed to create uploads directory: " + err.Error(),
		})
		return
	}

	// Generate filename
	filename := req.Filename
	if filename == "" {
		filename = fmt.Sprintf("paste-%s%s", uuid.New().String()[:8], ext)
	} else {
		// Sanitize filename and ensure correct extension
		filename = filepath.Base(filename)
		if !strings.HasSuffix(strings.ToLower(filename), ext) {
			filename = strings.TrimSuffix(filename, filepath.Ext(filename)) + ext
		}
	}

	fullPath := filepath.Join(uploadsDir, filename)

	// Write file
	//nolint:gosec // G306: 0644 is appropriate for user-uploaded images
	if err := os.WriteFile(fullPath, imageData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, UploadImageResponse{
			Success: false,
			Error:   "Failed to write file: " + err.Error(),
		})
		return
	}

	log.Printf("[Forge] Uploaded image: %s (%d bytes)", fullPath, len(imageData))

	c.JSON(http.StatusOK, UploadImageResponse{
		Path:    fullPath,
		Success: true,
	})
}

// ClearUploadsResponse represents the response from clearing uploads.
type ClearUploadsResponse struct {
	Deleted int    `json:"deleted"` // Number of files deleted
	Success bool   `json:"success"` // Whether clear succeeded
	Error   string `json:"error"`   // Error message if failed
}

// HandleClearUploads removes all files from the .forge-uploads directory.
// DELETE /api/forge/uploads
func (h *TerminalHandler) HandleClearUploads(c *gin.Context) {
	uploadsDir := h.getForgeUploadsDir()

	// Check if directory exists
	if _, err := os.Stat(uploadsDir); os.IsNotExist(err) {
		c.JSON(http.StatusOK, ClearUploadsResponse{
			Deleted: 0,
			Success: true,
		})
		return
	}

	// Read directory contents
	entries, err := os.ReadDir(uploadsDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, ClearUploadsResponse{
			Success: false,
			Error:   "Failed to read uploads directory: " + err.Error(),
		})
		return
	}

	// Delete each file
	deleted := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue // Skip directories
		}
		filePath := filepath.Join(uploadsDir, entry.Name())
		if err := os.Remove(filePath); err != nil {
			log.Printf("[Forge] Warning: failed to delete %s: %v", filePath, err)
		} else {
			deleted++
		}
	}

	log.Printf("[Forge] Cleared %d files from uploads directory", deleted)

	c.JSON(http.StatusOK, ClearUploadsResponse{
		Deleted: deleted,
		Success: true,
	})
}

// fetchGitHubToken returns the GitHub token for terminal environment injection.
// This is used for gh CLI and git operations. LLM API keys are NOT injected -
// users authenticate Claude CLI via its built-in OAuth flow.
func (h *TerminalHandler) fetchGitHubToken(githubTokenFromContext string) *TerminalAPIKeys {
	apiKeys := &TerminalAPIKeys{}

	// Use GitHub token from session context (set by SessionAuthMiddleware)
	if githubTokenFromContext != "" {
		apiKeys.GitHubToken = githubTokenFromContext
		log.Printf("[Forge] GitHub token available for terminal (length: %d)", len(githubTokenFromContext))
	} else {
		log.Printf("[Forge] No GitHub token available - gh CLI may require authentication")
	}

	return apiKeys
}
