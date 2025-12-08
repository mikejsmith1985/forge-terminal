package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
	"github.com/mikejsmith1985/forge-terminal/internal/assistant"
	"github.com/mikejsmith1985/forge-terminal/internal/commands"
	"github.com/mikejsmith1985/forge-terminal/internal/files"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/storage"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

//go:embed all:web
var embeddedFS embed.FS

// Preferred ports to try, in order
var preferredPorts = []int{8333, 8080, 9000, 3000, 3333}

// Global assistant service (initialized in main)
var assistantService assistant.Service

func main() {
	// Migrate storage structure if needed
	log.Printf("[Forge] Checking storage structure...")
	if err := storage.MigrateToV2(); err != nil {
		log.Printf("[Forge] Warning: storage migration failed: %v", err)
	}
	if err := storage.EnsureDirectories(); err != nil {
		log.Printf("[Forge] Warning: failed to ensure directories: %v", err)
	}
	log.Printf("[Forge] Storage structure: %s", storage.GetCurrentStructure())

	// Serve embedded frontend with no-cache headers
	webFS, err := fs.Sub(embeddedFS, "web")
	if err != nil {
		log.Fatal("Failed to load embedded web files:", err)
	}

	// Wrap file server with cache-control headers
	fileServer := http.FileServer(http.FS(webFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Prevent caching to avoid stale WebSocket connection issues
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		fileServer.ServeHTTP(w, r)
	})

	// WebSocket terminal handler
	// Run AM cleanup on startup and initialize AM system
	go am.CleanupOldLogs()
	amSystem := am.InitSystem(am.DefaultAMDir())
	if err := amSystem.Start(); err != nil {
		log.Printf("[AM] Failed to start AM system: %v", err)
	}

	// Initialize assistant core with AM system
	assistantCore := assistant.NewCore(amSystem)
	log.Printf("[Assistant] Core initialized")

	// Wrap core in LocalService (v1 implementation)
	assistantService = assistant.NewLocalService(assistantCore)
	log.Printf("[Assistant] LocalService initialized")

	termHandler := terminal.NewHandler(assistantService, assistantCore)
	http.HandleFunc("/ws", termHandler.HandleWebSocket)

	// Commands API
	http.HandleFunc("/api/commands", handleCommands)
	http.HandleFunc("/api/commands/restore-defaults", handleRestoreDefaultCommands)

	// Config API
	http.HandleFunc("/api/config", handleConfig)

	// WSL detection API
	http.HandleFunc("/api/wsl/detect", handleWSLDetect)

	// Shutdown API - allows graceful shutdown from browser
	http.HandleFunc("/api/shutdown", handleShutdown)

	// Update API - check for updates and apply them
	http.HandleFunc("/api/version", handleVersion)
	http.HandleFunc("/api/update/check", handleUpdateCheck)
	http.HandleFunc("/api/update/apply", handleUpdateApply)
	http.HandleFunc("/api/update/versions", handleListVersions)
	http.HandleFunc("/api/update/events", handleUpdateEvents)                // SSE for push update notifications
	http.HandleFunc("/api/update/install-manual", handleInstallManualUpdate) // Install manually downloaded binary

	// Sessions API - persist tab state across refreshes
	http.HandleFunc("/api/sessions", handleSessions)

	// Welcome screen API - track if welcome has been shown
	http.HandleFunc("/api/welcome", handleWelcome)

	// AM (Artificial Memory) API - session logging and recovery
	http.HandleFunc("/api/am/enable", handleAMEnable)
	http.HandleFunc("/api/am/log", handleAMLog)
	http.HandleFunc("/api/am/check", handleAMCheck)
	http.HandleFunc("/api/am/check/enhanced", func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckEnhanced(w, r)
	})
	http.HandleFunc("/api/am/check/grouped", func(w http.ResponseWriter, r *http.Request) {
		handleAMCheckGrouped(w, r)
	})
	http.HandleFunc("/api/am/content/", handleAMContent)
	http.HandleFunc("/api/am/archive/", handleAMArchive)
	http.HandleFunc("/api/am/cleanup", handleAMCleanup)
	http.HandleFunc("/api/am/install-hooks", handleAMInstallHooks)
	http.HandleFunc("/api/am/llm/conversations/", handleAMLLMConversations)
	http.HandleFunc("/api/am/health", handleAMHealth)
	http.HandleFunc("/api/am/conversations", handleAMActiveConversations)
	http.HandleFunc("/api/am/apply-hooks", handleAMApplyHooks)
	http.HandleFunc("/api/am/hook", handleAMHook)
	http.HandleFunc("/api/am/restore-hooks", handleAMRestoreHooks)

	// Desktop shortcut API
	http.HandleFunc("/api/desktop-shortcut", handleDesktopShortcut)

	// File management API
	http.HandleFunc("/api/files/list", files.HandleList)
	http.HandleFunc("/api/files/read", files.HandleRead)
	http.HandleFunc("/api/files/write", files.HandleWrite)
	http.HandleFunc("/api/files/delete", files.HandleDelete)
	http.HandleFunc("/api/files/stream", files.HandleReadStream)

	// Assistant API - AI chat and command suggestions (Dev Mode only)
	http.HandleFunc("/api/assistant/status", handleAssistantStatus)
	http.HandleFunc("/api/assistant/chat", handleAssistantChat)
	http.HandleFunc("/api/assistant/execute", handleAssistantExecute)

	// Find an available port
	addr, listener, err := findAvailablePort()
	if err != nil {
		log.Fatalf("Failed to find available port: %v", err)
	}

	log.Printf("🔥 Forge Terminal starting at http://%s", addr)

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		log.Println("\n👋 Shutting down Forge...")
		os.Exit(0)
	}()

	// Auto-open browser (skip if NO_BROWSER env var is set for testing)
	if os.Getenv("NO_BROWSER") == "" {
		go openBrowser("http://" + addr)
	}

	log.Fatal(http.Serve(listener, nil))
}

func handleCommands(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		log.Printf("[API] Loading commands...")
		cmds, err := commands.LoadCommands()
		if err != nil {
			log.Printf("[API] Failed to load commands: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Auto-migrate commands with missing LLM metadata
		migrated, changed := commands.MigrateCommands(cmds)
		if changed {
			log.Printf("[API] Auto-migrated %d commands with new LLM metadata", len(migrated))
			if err := commands.SaveCommands(migrated); err != nil {
				log.Printf("[API] Failed to save migrated commands: %v", err)
			}
			cmds = migrated
		}

		log.Printf("[API] Successfully loaded %d commands", len(cmds))
		json.NewEncoder(w).Encode(cmds)

	case http.MethodPost:
		var cmds []commands.Command
		if err := json.NewDecoder(r.Body).Decode(&cmds); err != nil {
			log.Printf("[API] Failed to decode commands: %v", err)
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Printf("[API] Saving %d commands...", len(cmds))
		if err := commands.SaveCommands(cmds); err != nil {
			log.Printf("[API] Failed to save commands: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Printf("[API] Successfully saved commands")
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleRestoreDefaultCommands(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse the request body to see which commands to restore
	var req struct {
		CommandIDs []int `json:"commandIds"` // Empty means restore all missing
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Load existing commands
	existingCmds, err := commands.LoadCommands()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Create a map of existing command IDs
	existingIDs := make(map[int]bool)
	for _, cmd := range existingCmds {
		existingIDs[cmd.ID] = true
	}

	// Add missing default commands
	newCommands := existingCmds
	restoredCount := 0

	for _, defaultCmd := range commands.DefaultCommands {
		// Check if we should restore this command
		shouldRestore := false
		if len(req.CommandIDs) == 0 {
			// No specific IDs requested - restore all missing
			shouldRestore = !existingIDs[defaultCmd.ID]
		} else {
			// Specific IDs requested - check if this one is in the list
			for _, id := range req.CommandIDs {
				if id == defaultCmd.ID {
					shouldRestore = true
					break
				}
			}
		}

		if shouldRestore && !existingIDs[defaultCmd.ID] {
			newCommands = append(newCommands, defaultCmd)
			restoredCount++
		}
	}

	// Save updated commands
	if restoredCount > 0 {
		if err := commands.SaveCommands(newCommands); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"restored": restoredCount,
		"commands": newCommands,
	})
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	if cmd != nil {
		_ = cmd.Start()
	}
}

func handleShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"shutting down"}`))
	log.Println("👋 Shutdown requested from browser")
	// Give the response time to send before exiting
	go func() {
		<-time.After(500 * time.Millisecond)
		os.Exit(0)
	}()
}

func handleConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		config, err := commands.LoadConfig()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(config)

	case http.MethodPost:
		var config commands.Config
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := commands.SaveConfig(&config); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleWSLDetect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if runtime.GOOS != "windows" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": false,
			"reason":    "Not running on Windows",
		})
		return
	}

	// Get list of WSL distros
	cmd := exec.Command("wsl", "--list", "--quiet")
	hideWindow(cmd) // Prevent console window flash
	output, err := cmd.Output()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": false,
			"reason":    "WSL not installed or not available",
		})
		return
	}

	// Parse distro names (handle UTF-16 output from wsl.exe)
	distros := []string{}
	lines := strings.Split(string(bytes.ReplaceAll(output, []byte{0}, []byte{})), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			distros = append(distros, line)
		}
	}

	if len(distros) == 0 {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": false,
			"reason":    "No WSL distributions installed",
		})
		return
	}

	// Try to get the username from the first distro
	username := ""
	if len(distros) > 0 {
		userCmd := exec.Command("wsl", "-d", distros[0], "-e", "whoami")
		hideWindow(userCmd) // Prevent console window flash
		userOutput, err := userCmd.Output()
		if err == nil {
			username = strings.TrimSpace(string(userOutput))
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"available":   true,
		"distros":     distros,
		"defaultUser": username,
		"defaultHome": "/home/" + username,
	})
}

// findAvailablePort tries preferred ports in order and returns the first available one
func findAvailablePort() (string, net.Listener, error) {
	for _, port := range preferredPorts {
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return addr, listener, nil
		}
		log.Printf("Port %d unavailable, trying next...", port)
	}

	// Fallback: let OS assign a random available port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, fmt.Errorf("no available ports: %w", err)
	}
	addr := listener.Addr().String()
	log.Printf("Using OS-assigned port: %s", addr)
	return addr, listener, nil
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"version": updater.GetVersion(),
	})
}

func handleUpdateCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	info, err := updater.CheckForUpdate()
	if err != nil {
		log.Printf("[Updater] Check failed: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available":      false,
			"currentVersion": updater.GetVersion(),
			"error":          err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(info)
}

// Stored update info for apply
var pendingUpdate *updater.UpdateInfo

func handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Check for update first
	info, err := updater.CheckForUpdate()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if !info.Available {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "No update available",
		})
		return
	}

	// Download the update
	log.Printf("[Updater] Downloading %s...", info.AssetName)
	tmpPath, err := updater.DownloadUpdate(info)
	if err != nil {
		log.Printf("[Updater] Download failed: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Download failed: " + err.Error(),
		})
		return
	}

	// Apply the update
	log.Printf("[Updater] Applying update...")
	if err := updater.ApplyUpdate(tmpPath); err != nil {
		log.Printf("[Updater] Apply failed: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Apply failed: " + err.Error(),
		})
		return
	}

	log.Printf("[Updater] Update applied successfully! Restarting...")

	// Send success response
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"newVersion": info.LatestVersion,
		"message":    "Update applied. Restarting...",
	})

	// Restart the application
	go func() {
		time.Sleep(500 * time.Millisecond)
		restartSelf()
	}()
}

func handleInstallManualUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse request body for the binary file path
	var req struct {
		FilePath string `json:"filePath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[Updater] Failed to decode request: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	if req.FilePath == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "File path is required",
		})
		return
	}

	// Verify the file exists
	if _, err := os.Stat(req.FilePath); err != nil {
		log.Printf("[Updater] File not found: %s", req.FilePath)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "File not found: " + req.FilePath,
		})
		return
	}

	// Apply the update using the same mechanism as auto-update
	log.Printf("[Updater] Installing manual update from: %s", req.FilePath)
	if err := updater.ApplyUpdate(req.FilePath); err != nil {
		log.Printf("[Updater] Manual install failed: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Install failed: " + err.Error(),
		})
		return
	}

	log.Printf("[Updater] Manual update applied successfully! Restarting...")

	// Send success response
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Update applied. Restarting...",
	})

	// Restart the application
	go func() {
		time.Sleep(500 * time.Millisecond)
		restartSelf()
	}()
}

func restartSelf() {
	executable, err := os.Executable()
	if err != nil {
		log.Printf("[Updater] Failed to get executable path: %v", err)
		os.Exit(1)
	}

	// On Windows, we need to start a new process and exit
	// On Unix, we can use exec to replace the current process
	if runtime.GOOS == "windows" {
		cmd := exec.Command(executable)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Start()
		os.Exit(0)
	} else {
		// Unix: replace current process
		syscall.Exec(executable, []string{executable}, os.Environ())
	}
}

func handleListVersions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	releases, err := updater.ListReleases(10) // Get last 10 releases
	if err != nil {
		log.Printf("[Updater] Failed to list releases: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":    err.Error(),
			"releases": []interface{}{},
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"releases":       releases,
		"currentVersion": updater.GetVersion(),
	})
}

// handleUpdateEvents provides Server-Sent Events (SSE) for real-time update notifications
func handleUpdateEvents(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Ensure we can flush
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	// Send initial connection event with current version
	fmt.Fprintf(w, "event: connected\ndata: {\"version\":\"%s\"}\n\n", updater.GetVersion())
	flusher.Flush()

	// Check for updates every 30 seconds (more frequent for better UX)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Track last known version to avoid duplicate notifications
	lastNotifiedVersion := ""
	consecutiveErrors := 0
	maxConsecutiveErrors := 3

	for {
		select {
		case <-r.Context().Done():
			// Client disconnected
			log.Printf("[SSE] Client disconnected")
			return
		case <-ticker.C:
			// Check for updates with timeout
			info, err := updater.CheckForUpdate()
			if err != nil {
				consecutiveErrors++
				log.Printf("[SSE] Update check failed (attempt %d/%d): %v", consecutiveErrors, maxConsecutiveErrors, err)

				// Send error event to client if too many failures
				if consecutiveErrors >= maxConsecutiveErrors {
					fmt.Fprintf(w, "event: error\ndata: {\"message\":\"Failed to check for updates\"}\n\n")
					flusher.Flush()
					log.Printf("[SSE] Sent error notification after %d failures", consecutiveErrors)
					consecutiveErrors = 0 // Reset counter after notifying
				}
				continue
			}

			// Reset error counter on success
			consecutiveErrors = 0

			// Send update notification if available and not already notified
			if info.Available && info.LatestVersion != lastNotifiedVersion {
				lastNotifiedVersion = info.LatestVersion
				data, _ := json.Marshal(map[string]interface{}{
					"available":     true,
					"latestVersion": info.LatestVersion,
					"releaseNotes":  info.ReleaseNotes,
					"downloadURL":   info.DownloadURL,
				})
				fmt.Fprintf(w, "event: update\ndata: %s\n\n", data)
				flusher.Flush()
				log.Printf("[SSE] Sent update notification: %s", info.LatestVersion)
			}
		}
	}
}

func handleSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		session, err := commands.LoadSession()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(session)

	case http.MethodPost:
		var session commands.Session
		if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := commands.SaveSession(&session); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleWelcome(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	currentVersion := updater.GetVersion()

	switch r.Method {
	case http.MethodGet:
		// Check if welcome screen should be shown
		shown := commands.IsWelcomeShown(currentVersion)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"shown":   shown,
			"version": currentVersion,
		})

	case http.MethodPost:
		// Mark welcome as shown for current version
		if err := commands.SetWelcomeShown(currentVersion); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"version": currentVersion,
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// AM (Artificial Memory) handlers

func handleAMEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req am.EnableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	registry := am.GetRegistry()
	logger, err := registry.Get(req.TabID, req.TabName, req.Workspace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if req.Enabled {
		if err := logger.Enable(); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		log.Printf("[AM] Logging enabled for tab %s", req.TabID)
	} else {
		if err := logger.Disable(); err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		log.Printf("[AM] Logging disabled for tab %s", req.TabID)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"enabled": req.Enabled,
		"logPath": logger.GetLogPath(),
	})
}

func handleAMLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req am.AppendLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	registry := am.GetRegistry()
	logger, err := registry.Get(req.TabID, req.TabName, req.Workspace)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if err := logger.Log(req.EntryType, req.Content); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// If triggerAM is set, start LLM conversation tracking
	var convID string
	if req.TriggerAM {
		log.Printf("[AM API] ═══ COMMAND CARD TRIGGER ═══")
		log.Printf("[AM API] triggerAM=true, tabID=%s, command='%s'", req.TabID, req.Content)
		log.Printf("[AM API] llmProvider='%s', description='%s'", req.LLMProvider, req.Description)
		
		amSystem := am.GetSystem()
		if amSystem == nil {
			log.Printf("[AM API] ❌ CRITICAL: AM System is nil!")
		} else {
			log.Printf("[AM API] ✓ AM System exists")
			
			llmLogger := amSystem.GetLLMLogger(req.TabID)
			if llmLogger == nil {
				log.Printf("[AM API] ❌ CRITICAL: LLM Logger is nil for tab %s", req.TabID)
			} else {
				log.Printf("[AM API] ✓ LLM Logger exists for tab %s", req.TabID)
				
				// Determine provider from explicit field or infer from command
				provider := inferLLMProvider(req.LLMProvider, req.Content)
				cmdType := inferLLMType(req.LLMType)
				
				log.Printf("[AM API] Provider inference: explicit='%s' command='%s' → result=%s", req.LLMProvider, req.Content, provider)
				log.Printf("[AM API] Type inference: explicit='%s' → result=%s", req.LLMType, cmdType)

				detected := &llm.DetectedCommand{
					Provider: provider,
					Type:     cmdType,
					Prompt:   req.Description,
					RawInput: req.Content,
					Detected: true,
				}

				log.Printf("[AM API] Calling StartConversation with provider=%s type=%s", provider, cmdType)
				convID = llmLogger.StartConversation(detected)
				log.Printf("[AM API] ✅ StartConversation returned: convID='%s'", convID)
				
				// Verify conversation was actually created
				convs := llmLogger.GetConversations()
				log.Printf("[AM API] Verification: GetConversations() returned %d conversations", len(convs))
				if len(convs) > 0 {
					log.Printf("[AM API] ✓ Latest conversation: ID=%s provider=%s type=%s", 
						convs[len(convs)-1].ConversationID, 
						convs[len(convs)-1].Provider, 
						convs[len(convs)-1].CommandType)
				}
				
				activeID := llmLogger.GetActiveConversationID()
				log.Printf("[AM API] Active conversation ID: '%s'", activeID)
				
				if activeID != convID {
					log.Printf("[AM API] ⚠️ WARNING: Active ID (%s) != returned ID (%s)", activeID, convID)
				} else {
					log.Printf("[AM API] ✓ Active conversation matches returned ID")
				}
			}
		}
		log.Printf("[AM API] ═══ END COMMAND CARD TRIGGER ═══")
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":        true,
		"conversationId": convID,
	})
}

// inferLLMProvider determines the LLM provider from explicit field or command text
func inferLLMProvider(explicit string, command string) llm.Provider {
	// Use explicit provider if specified
	switch strings.ToLower(explicit) {
	case "copilot", "github-copilot":
		return llm.ProviderGitHubCopilot
	case "claude":
		return llm.ProviderClaude
	case "aider":
		return llm.ProviderAider
	}

	// Fallback: infer from command text
	lower := strings.ToLower(command)
	if strings.Contains(lower, "copilot") || strings.Contains(lower, "gh copilot") {
		return llm.ProviderGitHubCopilot
	}
	if strings.Contains(lower, "claude") {
		return llm.ProviderClaude
	}
	if strings.Contains(lower, "aider") {
		return llm.ProviderAider
	}

	return llm.ProviderUnknown
}

// inferLLMType determines the command type from explicit field
func inferLLMType(explicit string) llm.CommandType {
	switch strings.ToLower(explicit) {
	case "chat":
		return llm.CommandChat
	case "suggest":
		return llm.CommandSuggest
	case "explain":
		return llm.CommandExplain
	case "code":
		return llm.CommandCode
	}
	return llm.CommandChat // Default to chat
}

func handleAMCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	sessions, err := am.CheckForRecoverableSessions()
	if err != nil {
		json.NewEncoder(w).Encode(am.RecoveryInfo{
			HasRecoverable: false,
			Sessions:       []am.SessionInfo{},
		})
		return
	}

	json.NewEncoder(w).Encode(am.RecoveryInfo{
		HasRecoverable: len(sessions) > 0,
		Sessions:       sessions,
	})
}

// handleAMCheckEnhancedCore contains the core logic for enhanced session recovery
func handleAMCheckEnhancedCore(sessions []am.SessionInfo) am.RecoveryInfo {
	return am.RecoveryInfo{
		HasRecoverable: len(sessions) > 0,
		Sessions:       sessions,
	}
}

// handleAMCheckEnhanced returns session recovery info with enhanced context (workspace, commands, etc)
func handleAMCheckEnhanced(w http.ResponseWriter, r *http.Request, sessions ...[]am.SessionInfo) am.RecoveryInfo {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return am.RecoveryInfo{}
	}

	w.Header().Set("Content-Type", "application/json")

	var sessionsList []am.SessionInfo
	if len(sessions) > 0 && sessions[0] != nil {
		// For testing: allow passing mock sessions
		sessionsList = sessions[0]
	} else {
		// Production: fetch from AM system
		var err error
		sessionsList, err = am.CheckForRecoverableSessions()
		if err != nil {
			sessionsList = []am.SessionInfo{}
		}
	}

	// Response includes all enhanced fields from SessionInfo
	result := handleAMCheckEnhancedCore(sessionsList)
	json.NewEncoder(w).Encode(result)
	return result
}

// handleAMCheckGroupedCore contains the core logic for grouped session recovery
func handleAMCheckGroupedCore(sessions []am.SessionInfo) am.RecoveryInfoGrouped {
	groups := am.GroupSessionsByWorkspace(sessions)
	return am.RecoveryInfoGrouped{
		HasRecoverable: len(sessions) > 0,
		Groups:         groups,
		TotalSessions:  len(sessions),
	}
}

// handleAMCheckGrouped returns session recovery info grouped by workspace
func handleAMCheckGrouped(w http.ResponseWriter, r *http.Request, sessions ...[]am.SessionInfo) am.RecoveryInfoGrouped {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return am.RecoveryInfoGrouped{}
	}

	w.Header().Set("Content-Type", "application/json")

	var sessionsList []am.SessionInfo
	if len(sessions) > 0 && sessions[0] != nil {
		// For testing: allow passing mock sessions
		sessionsList = sessions[0]
	} else {
		// Production: fetch from AM system
		var err error
		sessionsList, err = am.CheckForRecoverableSessions()
		if err != nil {
			sessionsList = []am.SessionInfo{}
		}
	}

	// Group sessions by workspace
	result := handleAMCheckGroupedCore(sessionsList)
	json.NewEncoder(w).Encode(result)
	return result
}

func handleAMContent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract tabId from URL path
	tabID := strings.TrimPrefix(r.URL.Path, "/api/am/content/")
	if tabID == "" {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}

	content, err := am.GetLogContent(tabID)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"content": content,
	})
}

func handleAMArchive(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract tabId from URL path
	tabID := strings.TrimPrefix(r.URL.Path, "/api/am/archive/")
	if tabID == "" {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}

	if err := am.ArchiveLog(tabID); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// Remove from registry
	am.GetRegistry().Remove(tabID)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func handleAMCleanup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if err := am.CleanupOldLogs(); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// handleAMInstallHooks writes a helper script to the user's ~/.forge and returns its path and contents.
func handleAMInstallHooks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	path, content, err := am.InstallShellHooks()
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"path":    path,
		"content": content,
	})
}

// handleAMApplyHooks will append hook snippets to the user's shell rc when requested.
func handleAMApplyHooks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req struct {
		Shell   string `json:"shell"`   // "bash" or "powershell"
		Preview bool   `json:"preview"` // if true, return the snippet only
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if req.Preview {
		snippet := am.GetSnippet(req.Shell)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"snippet": snippet,
		})
		return
	}

	path, backup, err := am.ApplyShellHooks(req.Shell)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"path":    path,
		"backup":  backup,
	})
}

// handleAMHook receives hook POSTs from user shells and marks Layer 2 healthy when seen.
func handleAMHook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// Publish layer 2 event to the AM EventBus
	am.EventBus.Publish(&am.LayerEvent{
		Type:      "HOOK",
		Layer:     2,
		Timestamp: time.Now(),
		Metadata:  payload,
	})

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// handleAMRestoreHooks restores a backup file over the target profile.
func handleAMRestoreHooks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var req struct {
		Backup string `json:"backup"`
		Target string `json:"target"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	// Basic validation: ensure backup file exists and contains the .forge-backup- marker
	if req.Backup == "" || !strings.Contains(req.Backup, ".forge-backup-") {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "invalid backup path",
		})
		return
	}

	if _, err := os.Stat(req.Backup); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "backup not found",
		})
		return
	}

	// Read backup and overwrite target
	b, err := os.ReadFile(req.Backup)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if err := os.WriteFile(req.Target, b, 0644); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"restored": req.Target,
	})
}

func handleAMLLMConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract tab ID from URL path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 5 {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}
	tabID := pathParts[len(pathParts)-1]

	log.Printf("[AM API] GET /api/am/llm/conversations/%s", tabID)

	// Get LLM logger for this tab
	llmLogger := am.GetLLMLogger(tabID, am.DefaultAMDir())
	log.Printf("[AM API] Retrieved LLM logger for tab %s", tabID)
	
	conversations := llmLogger.GetConversations()
	count := len(conversations)
	
	log.Printf("[AM API] GetConversations() returned %d conversations for tab %s", count, tabID)
	
	if count == 0 {
		log.Printf("[AM API] ⚠️ ZERO conversations found for tab %s", tabID)
		log.Printf("[AM API] Active conversation ID: '%s'", llmLogger.GetActiveConversationID())
	} else {
		log.Printf("[AM API] ✓ Found %d conversations:", count)
		for i, conv := range conversations {
			log.Printf("[AM API]   [%d] ID=%s provider=%s type=%s complete=%v turns=%d", 
				i, conv.ConversationID, conv.Provider, conv.CommandType, conv.Complete, len(conv.Turns))
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"conversations": conversations,
		"count":         count,
	})
}

func handleAMHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	system := am.GetSystem()
	if system == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "NOT_INITIALIZED",
		})
		return
	}

	health := system.GetHealth()
	json.NewEncoder(w).Encode(health)
}

func handleAMActiveConversations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	system := am.GetSystem()
	if system == nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"active": map[string]interface{}{},
			"count":  0,
		})
		return
	}

	convs := system.GetActiveConversations()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"active": convs,
		"count":  len(convs),
	})
}

func handleDesktopShortcut(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	err := createDesktopShortcut()
	if err != nil {
		log.Printf("[Desktop] Failed to create shortcut: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	log.Printf("[Desktop] Shortcut created successfully")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Desktop shortcut created",
	})
}

// handleAssistantStatus checks if Ollama is available.
func handleAssistantStatus(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodGet {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}

w.Header().Set("Content-Type", "application/json")
ctx := r.Context()

status, err := assistantService.GetStatus(ctx)
if err != nil {
http.Error(w, err.Error(), http.StatusInternalServerError)
return
}

json.NewEncoder(w).Encode(status)
}

// handleAssistantChat processes chat messages.
func handleAssistantChat(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}

w.Header().Set("Content-Type", "application/json")
ctx := r.Context()

var req assistant.ChatRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
http.Error(w, "Invalid request body", http.StatusBadRequest)
return
}

response, err := assistantService.Chat(ctx, &req)
if err != nil {
log.Printf("[Assistant] Chat error: %v", err)
http.Error(w, err.Error(), http.StatusInternalServerError)
return
}

json.NewEncoder(w).Encode(response)
}

// handleAssistantExecute executes a command.
func handleAssistantExecute(w http.ResponseWriter, r *http.Request) {
if r.Method != http.MethodPost {
http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
return
}

w.Header().Set("Content-Type", "application/json")
ctx := r.Context()

var req assistant.ExecuteCommandRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
http.Error(w, "Invalid request body", http.StatusBadRequest)
return
}

response, err := assistantService.ExecuteCommand(ctx, &req)
if err != nil {
log.Printf("[Assistant] Execute error: %v", err)
http.Error(w, err.Error(), http.StatusInternalServerError)
return
}

json.NewEncoder(w).Encode(response)
}
