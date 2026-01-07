package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	_ "net/http/pprof" // CPU/memory profiling - access at /debug/pprof/
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
	"github.com/mikejsmith1985/forge-terminal/internal/commands"
	"github.com/mikejsmith1985/forge-terminal/internal/diagnostic"
	"github.com/mikejsmith1985/forge-terminal/internal/files"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/lockfile"
	"github.com/mikejsmith1985/forge-terminal/internal/storage"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

//go:embed all:web
var embeddedFS embed.FS

// Preferred ports to try, in order
var preferredPorts = []int{3005, 8333, 8080, 9000, 3000, 3333}

// Active port (set at startup for process safeguard system)
var activePort int

// Terminal handler (set at startup for session management)
var termHandler *terminal.Handler

// headerFixingResponseWriter wraps http.ResponseWriter to fix MIME types for embedded assets
type headerFixingResponseWriter struct {
	http.ResponseWriter
	path      string
	headerSet bool
}

func (w *headerFixingResponseWriter) WriteHeader(statusCode int) {
	if !w.headerSet {
		w.headerSet = true
		// Fix MIME types based on file extension
		contentType := w.ResponseWriter.Header().Get("Content-Type")
		if contentType == "text/plain; charset=utf-8" || contentType == "" {
			if strings.HasSuffix(w.path, ".css") {
				w.ResponseWriter.Header().Set("Content-Type", "text/css; charset=utf-8")
			} else if strings.HasSuffix(w.path, ".js") {
				w.ResponseWriter.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			} else if strings.HasSuffix(w.path, ".svg") {
				w.ResponseWriter.Header().Set("Content-Type", "image/svg+xml")
			} else if strings.HasSuffix(w.path, ".mp4") {
				w.ResponseWriter.Header().Set("Content-Type", "video/mp4")
			}
		}
	}
	w.ResponseWriter.WriteHeader(statusCode)
}

func main() {
	// v3.7.2: Acquire instance lock to prevent multiple instances
	// This prevents resource contention and keystroke latency issues
	forgeDir := filepath.Join(os.Getenv("HOME"), ".forge")
	lock, err := lockfile.Acquire(forgeDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n\n", err)
		fmt.Fprintf(os.Stderr, "If you're sure no other instance is running, remove:\n")
		fmt.Fprintf(os.Stderr, "  %s\n", filepath.Join(forgeDir, "forge.lock"))
		os.Exit(1)
	}
	defer lock.Release()
	
	log.Printf("[Forge] Instance lock acquired (PID: %d)", os.Getpid())
	
	// Parse port from command line or environment
	var overridePort int
	for i := 1; i < len(os.Args); i++ {
		if os.Args[i] == "-port" || os.Args[i] == "--port" {
			if i+1 < len(os.Args) {
				if p, err := strconv.Atoi(os.Args[i+1]); err == nil {
					overridePort = p
				}
			}
		}
	}
	// Also check environment variable
	if overridePort == 0 {
		if envPort := os.Getenv("FORGE_PORT"); envPort != "" {
			if p, err := strconv.Atoi(envPort); err == nil {
				overridePort = p
			}
		}
	}
	
	// v3.7.1: Handle subcommands before starting web server
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "lens":
			// Run the Context Builder TUI
			args := []string{"."}
			if len(os.Args) > 2 {
				args = os.Args[2:]
			}
			if err := runLensCommand(args); err != nil {
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
			return
		case "-h", "--help", "help":
			fmt.Println("Forge Terminal - Agentic Coding Workspace")
			fmt.Println("")
			fmt.Println("Usage:")
			fmt.Println("  forge                  Start the web UI server")
			fmt.Println("  forge lens [path]      Open the Context Builder file picker")
			fmt.Println("  forge -port PORT       Start server on specific port")
			fmt.Println("  forge --port PORT      Start server on specific port")
			fmt.Println("")
			fmt.Println("Environment:")
			fmt.Println("  FORGE_PORT=9999        Override default port")
			fmt.Println("  FORGE_DEV_MODE=true    Enable dev mode logging")
			fmt.Println("")
			return
		}
	}

	// Set up file-based logging for production diagnostics
	logFile, err := os.OpenFile(filepath.Join(os.Getenv("HOME"), ".forge", "forge.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		// Log to both file and stdout
		log.SetOutput(os.Stdout) // Keep stdout for console
		log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
		// Also write to file by wrapping
		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
		defer logFile.Close()
	}

	// Migrate storage structure if needed
	log.Printf("[Forge] Checking storage structure...")
	if err := storage.MigrateToV2(); err != nil {
		log.Printf("[Forge] Warning: storage migration failed: %v", err)
	}
	if err := storage.EnsureDirectories(); err != nil {
		log.Printf("[Forge] Warning: failed to ensure directories: %v", err)
	}
	log.Printf("[Forge] Storage structure: %s", storage.GetCurrentStructure())

	// v3.12.3: SLM engine removed - context windows too small for complex tasks
	// Archived: internal/slm.removed/

	// v3.9.6: ChatView and Chat Store removed - functionality moved to Forge Assist
	// Chat bridge initialization removed

	// Serve embedded frontend with no-cache headers
	webFS, err := fs.Sub(embeddedFS, "web")
	if err != nil {
		log.Fatal("Failed to load embedded web files:", err)
	}

	// Wrap file server with cache-control headers and explicit MIME types
	fileServer := http.FileServer(http.FS(webFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve index.html with version-busted asset URLs
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			serveIndexWithVersion(w, r, webFS)
			return
		}

		// Wrap ResponseWriter to fix MIME types and cache headers
		wrapped := &headerFixingResponseWriter{
			ResponseWriter: w,
			path:           r.URL.Path,
		}

		// Prevent caching to avoid stale WebSocket connection issues
		wrapped.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		wrapped.Header().Set("Pragma", "no-cache")
		wrapped.Header().Set("Expires", "0")
		fileServer.ServeHTTP(wrapped, r)
	})

	// WebSocket terminal handler
	// Run AM cleanup on startup and initialize AM system

	// Initialize components needed by terminal handler
	// Vision system for terminal overlays
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)

	// LLM detector for AI CLI tool detection
	llmDetector := llm.NewDetector()

	// Create terminal handler with direct dependencies
	// v3.12.3: AM system removed - passing nil
	termHandler = terminal.NewHandlerDirect(nil, visionParser, llmDetector)
	http.HandleFunc("/ws", termHandler.HandleWebSocket)

	// Commands API
	http.HandleFunc("/api/commands", WrapWithMiddleware(handleCommands))
	http.HandleFunc("/api/commands/restore-defaults", WrapWithMiddleware(handleRestoreDefaultCommands))

	// Config API
	http.HandleFunc("/api/config", WrapWithMiddleware(handleConfig))

	// WSL detection API
	http.HandleFunc("/api/wsl/detect", WrapWithMiddleware(handleWSLDetect))

	// Shutdown API - allows graceful shutdown from browser
	http.HandleFunc("/api/shutdown", WrapWithMiddleware(handleShutdown))
	
	// IDE Integration API - open current workspace in external IDE
	http.HandleFunc("/api/ide/open", WrapWithMiddleware(handleOpenIDE))
	http.HandleFunc("/api/build/detect", WrapWithMiddleware(handleDetectBuildSystem))

	// Version and system info API
	http.HandleFunc("/api/version", WrapWithMiddleware(handleVersion))
	http.HandleFunc("/api/system-info", WrapWithMiddleware(handleSystemInfo))  // NEW: Process safeguard info
	http.HandleFunc("/api/update/check", WrapWithMiddleware(handleUpdateCheck))
	http.HandleFunc("/api/update/apply", WrapWithMiddleware(handleUpdateApply))
	http.HandleFunc("/api/update/versions", WrapWithMiddleware(handleListVersions))
	http.HandleFunc("/api/update/events", WrapWithMiddleware(handleUpdateEvents))                // SSE for push update notifications
	http.HandleFunc("/api/update/install-manual", WrapWithMiddleware(handleInstallManualUpdate)) // Install manually downloaded binary

	// Sessions API - persist tab state across refreshes
	http.HandleFunc("/api/sessions", WrapWithMiddleware(handleSessions))

	// Welcome screen API - track if welcome has been shown
	http.HandleFunc("/api/welcome", WrapWithMiddleware(handleWelcome))

	// v3.12.3: AM (Artificial Memory) API removed

	// Vision Configuration & Insights API
	http.HandleFunc("/api/vision/config", WrapWithMiddleware(handleVisionConfig))
	http.HandleFunc("/api/vision/insights/", WrapWithMiddleware(handleVisionInsights))
	http.HandleFunc("/api/vision/insights/summary/", WrapWithMiddleware(handleVisionInsightsSummary))

	// Model Router API (Industrial Phase 2)
	http.HandleFunc("/api/llm/model-tier", WrapWithMiddleware(handleModelTier))

	// Chat API (v3.3.0 - Chat Sidebar)
	http.HandleFunc("/api/llm/chat", WrapWithMiddleware(handleChat))

	// Router Configuration API (v3.3.0 - Smart Router)
	http.HandleFunc("/api/llm/router-config", WrapWithMiddleware(handleRouterConfig))
	http.HandleFunc("/api/llm/test-command", WrapWithMiddleware(handleTestCommand))

	// Provider Discovery API (v3.4.0 - Dynamic Provider Discovery)
	http.HandleFunc("/api/llm/verify-provider", WrapWithMiddleware(handleVerifyProvider))
	http.HandleFunc("/api/llm/providers", WrapWithMiddleware(handleListProviders))
	http.HandleFunc("/api/llm/providers/", WrapWithMiddleware(handleProviderModels))

	// Budget & CFO Router API removed in v3.12.11 - Intelligence tab deprecated
	// Archived: cmd/forge/handlers_budget.go.removed

	// SLM and Routing APIs removed in v3.12.3 - local LLM context window too small to be useful
	// Archived: internal/slm.removed/, internal/routing.removed/

	// CLI Configuration API - v3.5.3 (Copilot/Claude config management)
	http.HandleFunc("/api/cli/config", WrapWithMiddleware(handleCLIConfig))
	http.HandleFunc("/api/cli/copilot/config", WrapWithMiddleware(handleCLICopilotConfig))
	http.HandleFunc("/api/cli/claude/config", WrapWithMiddleware(handleCLIClaudeConfig))
	http.HandleFunc("/api/cli/copilot/trust", WrapWithMiddleware(handleCLITrustFolder))

	// Chat Store API - v3.5.1 (SQLite-backed persistent chat)
	http.HandleFunc("/api/chat/messages", WrapWithMiddleware(handleChatMessages))
	http.HandleFunc("/api/chat/search", WrapWithMiddleware(handleChatSearch))
	http.HandleFunc("/api/chat/thread/", WrapWithMiddleware(handleChatThread))
	http.HandleFunc("/api/chat/workers", WrapWithMiddleware(handleChatWorkers))
	http.HandleFunc("/api/chat/context", WrapWithMiddleware(handleChatContext))
	http.HandleFunc("/api/chat/images", WrapWithMiddleware(handleChatImageUpload))
	http.HandleFunc("/api/chat/images/", WrapWithMiddleware(handleChatImageServe))
	http.HandleFunc("/api/chat/ws", handleChatWebSocket) // WebSocket, no middleware wrapper

	// Diagnostics API - keyboard lockout debugging
	http.HandleFunc("/api/diagnostics/keyboard", WrapWithMiddleware(handleDiagnosticsKeyboard))
	http.HandleFunc("/api/diagnostics/status", WrapWithMiddleware(handleDiagnosticsStatus))
	http.HandleFunc("/api/diagnostics/platform", WrapWithMiddleware(handleDiagnosticsPlatform))

	// Freeze detection API - comprehensive runtime monitoring
	http.HandleFunc("/api/diagnostics/freeze/metrics", WrapWithMiddleware(diagnostic.HandleFreezeMetrics))
	http.HandleFunc("/api/diagnostics/freeze/current", WrapWithMiddleware(diagnostic.HandleFreezeCurrent))
	http.HandleFunc("/api/diagnostics/freeze/stats", WrapWithMiddleware(diagnostic.HandleFreezeStats))
	http.HandleFunc("/api/diagnostics/freeze/gc", WrapWithMiddleware(diagnostic.HandleForceGC))
	http.HandleFunc("/api/diagnostics/freeze/goroutines", WrapWithMiddleware(diagnostic.HandleGoroutines))
	http.HandleFunc("/api/diagnostics/runtime", WrapWithMiddleware(diagnostic.HandleRuntimeStats))

	// Start freeze detector on startup
	_ = diagnostic.GetFreezeDetector() // Auto-starts on first access

	// Debug Session API - Follow-Me Debugger (v3.12.0)
	http.HandleFunc("/api/debug-sessions", WrapWithMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleListDebugSessions(w, r)
		case http.MethodPost:
			handleSaveDebugSession(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/debug-sessions/", WrapWithMiddleware(handleGetDebugSession))

	// Desktop shortcut API
	http.HandleFunc("/api/desktop-shortcut", WrapWithMiddleware(handleDesktopShortcut))

	// File management API
	http.HandleFunc("/api/files/list", WrapWithMiddleware(handleListFiles)) // v3.3.7 Active Engineer
	http.HandleFunc("/api/files/flat", WrapWithMiddleware(files.HandleFlatList)) // v3.3.6 @ mentions
	http.HandleFunc("/api/files/stats", WrapWithMiddleware(files.HandleStats))
	http.HandleFunc("/api/files/read", WrapWithMiddleware(files.HandleRead))
	http.HandleFunc("/api/files/write", WrapWithMiddleware(files.HandleWrite))
	http.HandleFunc("/api/files/upload", WrapWithMiddleware(files.HandleUpload))
	http.HandleFunc("/api/files/delete", WrapWithMiddleware(files.HandleDelete))
	http.HandleFunc("/api/files/stream", WrapWithMiddleware(files.HandleReadStream))
	http.HandleFunc("/api/files/access-mode", WrapWithMiddleware(files.HandleFileAccessMode))
	
	// AI Instruction Files API - manage CLAUDE.md, copilot-instructions.md, etc.
	http.HandleFunc("/api/files/instructions", WrapWithMiddleware(files.HandleInstructionFiles))
	http.HandleFunc("/api/files/instructions/content", WrapWithMiddleware(files.HandleInstructionFileContent))

	// Error logging API - client-side error reporting
	http.HandleFunc("/api/log-error", WrapWithMiddleware(handleLogError))

	// Temp image upload API
	http.HandleFunc("/api/temp-image", WrapWithMiddleware(handleTempImageUpload))

	// Initialize session temp directory
	if err := initSessionTempDir(); err != nil {
		log.Printf("[ERROR] Failed to initialize session temp dir: %v", err)
	}

	// Find an available port (use override if specified)
	addr, listener, err := findAvailablePort(overridePort)
	if err != nil {
		log.Fatalf("Failed to find available port: %v", err)
	}

	// Extract port number and inject into child processes
	if _, portStr, err := net.SplitHostPort(addr); err == nil {
		if p, err := strconv.Atoi(portStr); err == nil {
			activePort = p
			terminal.SetForgePort(p)
			log.Printf("[Process Safeguard] Injecting FORGE_INSTANCE_PID=%d FORGE_INSTANCE_PORT=%d into child processes", os.Getpid(), p)
		}
	}

	log.Printf("🔥 Forge Terminal starting at http://%s (PID: %d)", addr, os.Getpid())

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
		// Use system default browser on Windows (do not force Chrome)
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

	// Close all terminal sessions but keep server running for automatic reconnection
	count := 0
	if termHandler != nil {
		count = termHandler.CloseAllSessions()
	}

	response := fmt.Sprintf(`{"status":"sessions_restarted","count":%d}`, count)
	w.Write([]byte(response))
	log.Printf("🔄 Restarted %d terminal sessions (server still running for reconnection)", count)
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
// If overridePort is specified (> 0), it will try that port first
func findAvailablePort(overridePort int) (string, net.Listener, error) {
	// If override port specified, try it first
	if overridePort > 0 {
		addr := fmt.Sprintf("localhost:%d", overridePort)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			log.Printf("[Dev] Using override port: %d", overridePort)
			return addr, listener, nil
		}
		log.Printf("[Dev] Override port %d unavailable: %v", overridePort, err)
		// Fall through to try preferred ports
	}
	
	for _, port := range preferredPorts {
		// Use localhost to allow OS to choose IPv4/IPv6 as needed
		addr := fmt.Sprintf("localhost:%d", port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return addr, listener, nil
		}
		log.Printf("Port %d unavailable, trying next...", port)
	}

	// Fallback: let OS assign a random available port
	listener, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return "", nil, fmt.Errorf("no available ports: %w", err)
	}
	addr := listener.Addr().String()
	log.Printf("Using OS-assigned port: %s", addr)
	return addr, listener, nil
}

// handleOpenIDE opens the current workspace in an external IDE (VS Code, Cursor, etc.)
func handleOpenIDE(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	
	var req struct {
		IDE  string `json:"ide"`  // "vscode", "cursor", "idea", "sublime"
		Path string `json:"path"` // Workspace path to open
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}
	
	if req.Path == "" {
		// Use current working directory
		var err error
		req.Path, err = os.Getwd()
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": "Failed to get cwd"})
			return
		}
	}
	
	// Map IDE names to commands
	ideCommands := map[string][]string{
		"vscode":  {"code", req.Path},
		"cursor":  {"cursor", req.Path},
		"idea":    {"idea", req.Path},
		"sublime": {"subl", req.Path},
		"vim":     {"vim", req.Path},
	}
	
	ide := req.IDE
	if ide == "" {
		ide = "vscode" // Default
	}
	
	cmdArgs, ok := ideCommands[ide]
	if !ok {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false, 
			"error": fmt.Sprintf("Unknown IDE: %s. Supported: vscode, cursor, idea, sublime", ide),
		})
		return
	}
	
	// Run the command
	cmd := exec.Command(cmdArgs[0], cmdArgs[1:]...)
	if err := cmd.Start(); err != nil {
		log.Printf("[IDE] Failed to open %s: %v", ide, err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false, 
			"error": fmt.Sprintf("Failed to open %s: %v (is it installed?)", ide, err),
		})
		return
	}
	
	log.Printf("[IDE] Opened %s for: %s", ide, req.Path)
	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "ide": ide, "path": req.Path})
}

// handleDetectBuildSystem detects the build system for the current project
func handleDetectBuildSystem(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	path := r.URL.Query().Get("path")
	if path == "" {
		var err error
		path, err = os.Getwd()
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "Failed to get cwd"})
			return
		}
	}
	
	// Detect build systems by checking for config files
	type BuildSystem struct {
		Name        string `json:"name"`
		File        string `json:"file"`
		BuildCmd    string `json:"buildCmd"`
		DevCmd      string `json:"devCmd"`
		DeployCmd   string `json:"deployCmd,omitempty"`
		TestCmd     string `json:"testCmd,omitempty"`
		Detected    bool   `json:"detected"`
	}
	
	systems := []BuildSystem{
		// JavaScript/Node
		{Name: "npm", File: "package.json", BuildCmd: "npm run build", DevCmd: "npm run dev", TestCmd: "npm test"},
		{Name: "yarn", File: "yarn.lock", BuildCmd: "yarn build", DevCmd: "yarn dev", TestCmd: "yarn test"},
		{Name: "pnpm", File: "pnpm-lock.yaml", BuildCmd: "pnpm build", DevCmd: "pnpm dev", TestCmd: "pnpm test"},
		
		// Go
		{Name: "go", File: "go.mod", BuildCmd: "go build ./...", DevCmd: "go run .", TestCmd: "go test ./..."},
		
		// Python
		{Name: "pip", File: "requirements.txt", BuildCmd: "pip install -r requirements.txt", DevCmd: "python main.py", TestCmd: "pytest"},
		{Name: "poetry", File: "pyproject.toml", BuildCmd: "poetry install", DevCmd: "poetry run python main.py", TestCmd: "poetry run pytest"},
		
		// Rust
		{Name: "cargo", File: "Cargo.toml", BuildCmd: "cargo build --release", DevCmd: "cargo run", TestCmd: "cargo test"},
		
		// Java/JVM
		{Name: "maven", File: "pom.xml", BuildCmd: "mvn package", DevCmd: "mvn spring-boot:run", TestCmd: "mvn test"},
		{Name: "gradle", File: "build.gradle", BuildCmd: "gradle build", DevCmd: "gradle bootRun", TestCmd: "gradle test"},
		
		// .NET
		{Name: "dotnet", File: "*.csproj", BuildCmd: "dotnet build", DevCmd: "dotnet run", TestCmd: "dotnet test"},
		
		// Docker
		{Name: "docker", File: "Dockerfile", BuildCmd: "docker build -t app .", DevCmd: "docker-compose up", DeployCmd: "docker push app"},
		{Name: "docker-compose", File: "docker-compose.yml", BuildCmd: "docker-compose build", DevCmd: "docker-compose up -d"},
		
		// Make
		{Name: "make", File: "Makefile", BuildCmd: "make build", DevCmd: "make run", TestCmd: "make test"},
	}
	
	var detected []BuildSystem
	for _, sys := range systems {
		// Check if the config file exists
		checkPath := filepath.Join(path, sys.File)
		
		// Handle wildcard patterns like *.csproj
		if strings.Contains(sys.File, "*") {
			matches, _ := filepath.Glob(checkPath)
			if len(matches) > 0 {
				sys.Detected = true
				detected = append(detected, sys)
			}
		} else if _, err := os.Stat(checkPath); err == nil {
			sys.Detected = true
			detected = append(detected, sys)
		}
	}
	
	json.NewEncoder(w).Encode(map[string]interface{}{
		"path":     path,
		"systems":  detected,
		"hasBuilds": len(detected) > 0,
	})
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"version": updater.GetVersion(),
	})
}

func handleSystemInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	// Get active port from listener
	addr, _ := net.ResolveTCPAddr("tcp", "localhost:"+strconv.Itoa(activePort))
	
	json.NewEncoder(w).Encode(map[string]interface{}{
		"pid":     os.Getpid(),
		"port":    activePort,
		"version": updater.GetVersion(),
		"address": addr.String(),
		"processName": "forge-terminal",
		"safeguard": map[string]interface{}{
			"enabled": true,
			"version": "v3.11.6",
			"protectionLayers": 5,
		},
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

	log.Printf("[Updater] Update applied successfully! Server will restart in 3 seconds...")

	// Send success response FIRST
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"newVersion": info.LatestVersion,
		"message":    "Update applied. Server will restart...",
	})

	// Ensure response is fully sent
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// Restart the application after delay
	// This gives frontend time to:
	// 1. Receive the success response
	// 2. Show success message
	// 3. Set up server death detection polling
	go func() {
		time.Sleep(3 * time.Second)
		log.Printf("[Updater] Restarting now...")
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

	log.Printf("[Updater] Manual update applied successfully! Server will restart in 3 seconds...")

	// Send success response FIRST
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Update applied. Server will restart...",
	})

	// Ensure response is fully sent
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}

	// Restart the application after delay
	go func() {
		time.Sleep(3 * time.Second)
		log.Printf("[Updater] Restarting now...")
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

	// Skip update checks in dev mode
	if strings.Contains(os.Getenv("HOME"), "dev-data") {
		log.Printf("[SSE] Dev mode detected (HOME=%s), disabling auto-update checks", os.Getenv("HOME"))
		// Just keep the connection open without checking
		for {
			select {
			case <-r.Context().Done():
				return
			case <-ticker.C:
				// Send heartbeat to keep connection alive
				fmt.Fprintf(w, "event: heartbeat\ndata: {}\n\n")
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
			}
		}
	}

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



// handleLogError handles client-side error logging
func handleLogError(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var errorLog struct {
		Error     string `json:"error"`
		Stack     string `json:"stack"`
		Timestamp string `json:"timestamp"`
		Component string `json:"component,omitempty"`
		URL       string `json:"url,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&errorLog); err != nil {
		log.Printf("[Frontend Error] Failed to decode error report: %v", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	// Log the error with a clear prefix for frontend errors
	log.Printf("[Frontend Error] %s (at %s) - %s\nStack: %s", 
		errorLog.Error, errorLog.Component, errorLog.Timestamp, errorLog.Stack)

	// Always return success to prevent cascading errors on the frontend
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Error logged successfully",
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
			"code":    "SHORTCUT_CREATE_FAILED",
		})
		return
	}

	log.Printf("[Desktop] Shortcut created successfully")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Desktop shortcut created successfully",
		"code":    "SHORTCUT_CREATE_SUCCESS",
	})
}

// Vision Configuration handler

// handleVisionConfig handles GET and POST for Vision configuration
func handleVisionConfig(w http.ResponseWriter, r *http.Request) {
	// TODO: Initialize global vision config manager in main()
	// For now, use a simple file-based approach

	forgeDir := os.Getenv("FORGE_DIR")
	if forgeDir == "" {
		homeDir, _ := os.UserHomeDir()
		forgeDir = filepath.Join(homeDir, ".forge")
	}

	configPath := filepath.Join(forgeDir, "vision-config.json")

	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case http.MethodGet:
		// Read config
		data, err := os.ReadFile(configPath)
		if err != nil {
			if os.IsNotExist(err) {
				// Return default config
				defaultConfig := map[string]interface{}{
					"enabled": false,
					"detectors": map[string]bool{
						"json":           true,
						"compiler_error": true,
						"stack_trace":    true,
						"git":            true,
						"filepath":       true,
					},
					"jsonMinSize": 30,
					"autoDismiss": true,
				}
				json.NewEncoder(w).Encode(defaultConfig)
				return
			}
			http.Error(w, "Failed to read config", http.StatusInternalServerError)
			return
		}
		w.Write(data)

	case http.MethodPost:
		// Save config
		var config map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Ensure directory exists
		if err := os.MkdirAll(forgeDir, 0755); err != nil {
			http.Error(w, "Failed to create config directory", http.StatusInternalServerError)
			return
		}

		// Write config
		data, err := json.MarshalIndent(config, "", "  ")
		if err != nil {
			http.Error(w, "Failed to encode config", http.StatusInternalServerError)
			return
		}

		if err := os.WriteFile(configPath, data, 0644); err != nil {
			http.Error(w, "Failed to save config", http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "Vision config saved",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Vision Insights handlers

// handleVisionInsights returns insights for a specific tab
func handleVisionInsights(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract tabID from URL path: /api/vision/insights/{tabID}
	tabID := strings.TrimPrefix(r.URL.Path, "/api/vision/insights/")
	if tabID == "" {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}

	log.Printf("[Vision API] GET /api/vision/insights/%s", tabID)

	// v3.12.3: AM system removed - use default directory
	forgeDir := os.Getenv("FORGE_DIR")
	if forgeDir == "" {
		homeDir, _ := os.UserHomeDir()
		forgeDir = filepath.Join(homeDir, ".forge")
	}
	amDir := filepath.Join(forgeDir, "am")

	insights, err := terminal.LoadVisionInsights(amDir, tabID)
	if err != nil {
		log.Printf("[Vision API] Failed to load insights for tab %s: %v", tabID, err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  false,
			"error":    err.Error(),
			"insights": []interface{}{},
		})
		return
	}

	log.Printf("[Vision API] Loaded %d insights for tab %s", len(insights), tabID)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"insights": insights,
		"count":    len(insights),
	})
}

// handleVisionInsightsSummary returns a summary of insights for a specific tab
func handleVisionInsightsSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Extract tabID from URL path: /api/vision/insights/summary/{tabID}
	tabID := strings.TrimPrefix(r.URL.Path, "/api/vision/insights/summary/")
	if tabID == "" {
		http.Error(w, "Tab ID required", http.StatusBadRequest)
		return
	}

	log.Printf("[Vision API] GET /api/vision/insights/summary/%s", tabID)

	// v3.12.3: AM system removed - use default directory
	forgeDir := os.Getenv("FORGE_DIR")
	if forgeDir == "" {
		homeDir, _ := os.UserHomeDir()
		forgeDir = filepath.Join(homeDir, ".forge")
	}
	amDir := filepath.Join(forgeDir, "am")

	insights, err := terminal.LoadVisionInsights(amDir, tabID)
	if err != nil {
		log.Printf("[Vision API] Failed to load insights for tab %s: %v", tabID, err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	summary := terminal.GetVisionInsightSummary(insights)
	log.Printf("[Vision API] Generated summary for tab %s: %d total insights", tabID, summary["total"])

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"summary": summary,
	})
}

// handleDiagnosticsKeyboard logs keyboard diagnostic snapshots for debugging lockout issues
func handleDiagnosticsKeyboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Read and log the diagnostic data
	var diagnostic map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&diagnostic); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid JSON",
		})
		return
	}

	// Log to both console and file for debugging
	log.Printf("[Diagnostics] ========== KEYBOARD LOCKOUT SNAPSHOT ==========")

	// Extract key metrics for logging
	if capturedAt, ok := diagnostic["capturedAt"].(string); ok {
		log.Printf("[Diagnostics] Captured at: %s", capturedAt)
	}
	if tabId, ok := diagnostic["tabId"].(string); ok {
		log.Printf("[Diagnostics] Tab ID: %s", tabId)
	}

	// WebSocket state
	if wsState, ok := diagnostic["wsState"].(map[string]interface{}); ok {
		log.Printf("[Diagnostics] WebSocket: state=%v buffered=%v",
			wsState["readyStateText"], wsState["bufferedAmount"])
	}

	// Focus state
	if focusState, ok := diagnostic["focusState"].(map[string]interface{}); ok {
		log.Printf("[Diagnostics] Focus: activeElement=%v hasFocus=%v visibility=%v",
			focusState["activeElement"], focusState["hasFocus"], focusState["visibilityState"])
	}

	// Main thread health
	if mainThreadBusy, ok := diagnostic["mainThreadBusy"].(bool); ok {
		delay := diagnostic["mainThreadDelayMs"]
		log.Printf("[Diagnostics] Main Thread: busy=%v delay=%vms", mainThreadBusy, delay)
	}

	// Event stats
	if eventStats, ok := diagnostic["eventStats"].(map[string]interface{}); ok {
		log.Printf("[Diagnostics] Events: total=%v timeSinceLast=%vms pendingKeys=%v",
			eventStats["totalKeyEvents"],
			eventStats["timeSinceLastEvent"],
			len(eventStats["pendingKeys"].([]interface{})))

		// Log recent events for detailed debugging
		if recentEvents, ok := eventStats["recentEvents"].([]interface{}); ok && len(recentEvents) > 0 {
			log.Printf("[Diagnostics] Last %d keyboard events:", len(recentEvents))
			for i, ev := range recentEvents {
				if event, ok := ev.(map[string]interface{}); ok {
					log.Printf("[Diagnostics]   [%d] type=%s key=%s gap=%vms target=%s",
						i, event["type"], event["key"], event["timeSinceLast"], event["target"])
				}
			}
		}
	}

	log.Printf("[Diagnostics] ================================================")

	// Also save to diagnostics log file for later analysis
	diagDir := filepath.Join(os.Getenv("HOME"), ".forge", "diagnostics")
	if err := os.MkdirAll(diagDir, 0755); err == nil {
		diagFile := filepath.Join(diagDir, fmt.Sprintf("keyboard-%s.json",
			time.Now().Format("2006-01-02_15-04-05")))
		if data, err := json.MarshalIndent(diagnostic, "", "  "); err == nil {
			os.WriteFile(diagFile, data, 0644)
			log.Printf("[Diagnostics] Saved to: %s", diagFile)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Diagnostic logged",
	})
}

// handleDiagnosticsStatus returns current diagnostic system status.
func handleDiagnosticsStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	
	svc := diagnostic.GetService()
	amStatus := svc.GetAMStatus()
	platform := svc.GetPlatformInfo()
	events := svc.GetEvents(50)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"amStatus":     amStatus,
		"platform":     platform,
		"recentEvents": len(events),
	})
}

// handleDiagnosticsAMStatus returns detailed AM system status with file verification.
func handleDiagnosticsAMStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	
	svc := diagnostic.GetService()
	status := svc.GetAMStatus()

	json.NewEncoder(w).Encode(status)
}

// handleDiagnosticsPlatform returns platform detection information.
func handleDiagnosticsPlatform(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	
	svc := diagnostic.GetService()
	platform := svc.GetPlatformInfo()

	json.NewEncoder(w).Encode(platform)
}

// serveIndexWithVersion serves index.html
// Note: Vite generates content-hashed filenames (e.g., index-Nq_SWTTj.js) which
// provide automatic cache busting. No need for query string version parameters.
func serveIndexWithVersion(w http.ResponseWriter, r *http.Request, webFS fs.FS) {
	// Read the index.html file
	indexFile, err := webFS.Open("index.html")
	if err != nil {
		http.Error(w, "Failed to load index.html", http.StatusInternalServerError)
		return
	}
	defer indexFile.Close()

	content, err := io.ReadAll(indexFile)
	if err != nil {
		http.Error(w, "Failed to read index.html", http.StatusInternalServerError)
		return
	}

	// Set headers - rely on Vite's content hashing for cache busting
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	w.Write(content)
}

