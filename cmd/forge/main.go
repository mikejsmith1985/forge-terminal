package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"

	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"github.com/mikejsmith1985/forge-terminal/internal/commands"
	"github.com/mikejsmith1985/forge-terminal/internal/diagnostic"
	"github.com/mikejsmith1985/forge-terminal/internal/files"
	"github.com/mikejsmith1985/forge-terminal/internal/license"
	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/storage"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

//go:embed all:web
var embeddedFS embed.FS

// Preferred ports to try, in order
var preferredPorts = []int{3005, 8333, 8080, 9000, 3000, 3333}

// Active port (set at startup for process safeguard system)
var activePort int

// Dev mode flag (set via ldflags)
var devMode string

// Terminal handler (set at startup for session management)
var termHandler *terminal.Handler

// licenseGated is true when no valid license was found at startup.
// LicenseMiddleware reads this to return 402 on all gated API routes.
var licenseGated bool

// activeLicenseStatus and activeLicenseInfo hold the startup license check result.
// handlers_license.go updates these after a successful in-process activation.
var (
	activeLicenseStatus license.Status
	activeLicenseInfo   *license.Info
)

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
	// Determine home directory reliably
	homeDir, err := os.UserHomeDir()
	if err != nil {
		// Fallback to Env if UserHomeDir fails (rare)
		homeDir = os.Getenv("HOME")
	}
	if homeDir == "" {
		homeDir = "." // Last resort fallback
	}

	forgeDir := filepath.Join(homeDir, ".forge")
	
	// Check for devMode from environment if not set via ldflags
	if devMode == "" {
		devMode = os.Getenv("FORGE_DEV_MODE")
	}
	
	// Ensure directory exists for logging (created by lockfile usually, but we want to log earlier)
	_ = os.MkdirAll(forgeDir, 0755)

	// Set up file-based logging EARLY for production diagnostics
	logFilename := "forge.log"
	if devMode == "true" {
		logFilename = "forge-dev.log"
	}
	logPath := filepath.Join(forgeDir, logFilename)
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err == nil {
		// Log to both file and stdout
		log.SetOutput(os.Stdout) // Keep stdout for console
		log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
		// Also write to file by wrapping
		multiWriter := io.MultiWriter(os.Stdout, logFile)
		log.SetOutput(multiWriter)
		defer logFile.Close()
	}

	log.Printf("[Forge] Starting up... (Version: %s)", updater.GetVersion())
	log.Printf("[Forge] Home directory: %s", homeDir)

	if devMode == "true" {
		log.Printf("[Forge] Dev mode enabled")
	}

	// Run cleanup of old debug sessions (older than 7 days) in background
	go func() {
		log.Println("[Forge] Starting background cleanup of old debug sessions...")
		CleanupOldDebugSessions(7 * 24 * time.Hour)
	}()
	
	// Parse port and host from command line or environment
	var overridePort int
	var overrideHost string
	for i := 1; i < len(os.Args); i++ {
		if os.Args[i] == "-port" || os.Args[i] == "--port" {
			if i+1 < len(os.Args) {
				if p, err := strconv.Atoi(os.Args[i+1]); err == nil {
					overridePort = p
				}
			}
		}
		if os.Args[i] == "-host" || os.Args[i] == "--host" {
			if i+1 < len(os.Args) {
				overrideHost = os.Args[i+1]
			}
		}
	}
	// Also check environment variables
	if overridePort == 0 {
		if envPort := os.Getenv("FORGE_PORT"); envPort != "" {
			if p, err := strconv.Atoi(envPort); err == nil {
				overridePort = p
			}
		}
	}
	if overrideHost == "" {
		overrideHost = os.Getenv("FORGE_HOST")
	}
	// Parse hosted mode before applying defaults
	hostedCfg := parseHostedConfig(os.Args)
	if hostedCfg.Enabled {
		overrideHost = hostedCfg.Host
		applyHostedConfig(hostedCfg)
		log.Printf("[Forge] 📱 Hosted mode enabled — binding to %s with auth + tunnel", hostedCfg.Host)
	}

	// Auto-detect GitHub Codespaces environment
	inCodespaces := os.Getenv("CODESPACES") == "true"
	if inCodespaces && overrideHost == "" {
		overrideHost = "0.0.0.0"
		log.Printf("[Forge] GitHub Codespaces detected, binding to 0.0.0.0")
	}
	// Default to localhost
	if overrideHost == "" {
		overrideHost = "localhost"
	}
	// Auto-generate auth token for non-localhost bindings (skip if hosted mode already set it)
	if !hostedCfg.Enabled && overrideHost != "localhost" && overrideHost != "127.0.0.1" {
		token := os.Getenv("FORGE_TOKEN")
		if token == "" {
			token = GenerateToken()
		}
		SetAuthToken(token)
		log.Printf("[Forge] Auth token set for remote access")
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
			fmt.Println("  forge workflow ...     Workflow ledger commands (preflight|record)")
			fmt.Println("  forge -port PORT       Start server on specific port")
			fmt.Println("  forge --port PORT      Start server on specific port")
			fmt.Println("  forge --host HOST      Bind to specific host (default: localhost)")
			fmt.Println("  forge --host 0.0.0.0   Bind to all interfaces (enables token auth)")
			fmt.Println("  forge --hosted         Hosted mode: 0.0.0.0 + auth + tunnel + no browser")
			fmt.Println("")
			fmt.Println("Environment:")
			fmt.Println("  FORGE_PORT=9999        Override default port")
			fmt.Println("  FORGE_HOST=0.0.0.0     Override default host")
			fmt.Println("  FORGE_TOKEN=secret     Set auth token (auto-generated if host is non-localhost)")
			fmt.Println("  FORGE_DEV_MODE=true    Enable dev mode logging")
			fmt.Println("")
			return
		case "workflow":
			os.Exit(runWorkflowCommand(os.Args[2:]))
		}
	}

	// Logging is already set up at the top of main()
	
	// Migrate storage structure if needed
	log.Printf("[Forge] Checking storage structure...")
	if err := storage.MigrateToV2(); err != nil {
		log.Printf("[Forge] Warning: storage migration failed: %v", err)
	}
	if err := storage.EnsureDirectories(); err != nil {
		log.Printf("[Forge] Warning: failed to ensure directories: %v", err)
	}
	log.Printf("[Forge] Storage structure: %s", storage.GetCurrentStructure())

	// Migrate command cards — adds toolVariants/descriptionVariants/macroVariants
	// to the runner cards (IDs 6/7/8) so the CLI tool toggle works on first boot.
	if err := commands.AutoMigrateOnLoad(); err != nil {
		log.Printf("[Forge] Warning: command auto-migration failed: %v", err)
	}

	// v3.12.3: SLM engine removed - context windows too small for complex tasks
	// Archived: internal/slm.removed/

	// v3.9.6: ChatView and Chat Store removed - functionality moved to Forge Assist
	// Chat bridge initialization removed

	// Register pprof endpoints behind auth middleware
	RegisterPprofRoutes()

	// Initialize Code Tutor subsystem
	initTutor()

	// Initialize Forge Vault (AES-256-GCM encrypted secret store)
	initVault(storage.GetVaultDir())

	// Check license at startup — gates all /api/* routes via LicenseMiddleware.
	activeLicenseStatus, activeLicenseInfo = license.CheckLicense()
	licenseGated = activeLicenseStatus != license.StatusOK && activeLicenseStatus != license.StatusGrace
	log.Printf("[License] Startup: status=%s gated=%v", activeLicenseStatus, licenseGated)
	if !licenseGated {
		updater.DownloadURLResolver = func(ver, platform string) (string, error) {
			return license.SignedDownloadURL(activeLicenseInfo, ver, platform)
		}
		go license.StartHeartbeat(activeLicenseInfo)
	}

	// Serve embedded frontend with no-cache headers
	webFS, err := fs.Sub(embeddedFS, "web")
	if err != nil {
		log.Fatal("Failed to load embedded web files:", err)
	}

	// Serve the companion PWA at /companion/ without authentication.
	//
	// Redirect /companion (no trailing slash) to /companion/ so browsers that
	// omit the slash still land on the PWA rather than a 301-loop or 404.
	http.HandleFunc("/companion", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/companion/", http.StatusMovedPermanently)
	})

	// The Forge Companion PWA is a lightweight mobile interface for Forge Terminal.
	// The phone loads this static app before any token is established, so it
	// must be publicly accessible. The companion directory is copied into
	// cmd/forge/web/companion/ by the Vite build plugin, then embedded here
	// alongside the main frontend via the all:web directive.
	//
	// Actual API calls (/api/mobile/*) remain behind their own auth layer.
	companionSubFS, companionSubErr := fs.Sub(webFS, "companion")
	if companionSubErr != nil {
		log.Printf("[companion] WARNING: companion PWA files missing from embedded FS — " +
			"run 'cd frontend && npm run build' to regenerate them: %v", companionSubErr)
	} else {
		companionFileServer := http.FileServer(http.FS(companionSubFS))
		http.Handle("/companion/", http.StripPrefix("/companion", companionFileServer))
	}

	// Wrap file server with cache-control headers and explicit MIME types.
	// The outer mobile-aware redirect runs BEFORE auth so phones that hit
	// the bare URL land on the public companion PWA without first being
	// challenged for the desktop auth token.
	fileServer := http.FileServer(http.FS(webFS))
	rootHandler := AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
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

	// /api/ping must register BEFORE the catch-all "/" handler so the
	// named-tunnel supervisor's probe (https://<hostname>/api/ping) reaches
	// a real 200 instead of falling into the desktop-UI auth challenge.
	registerPingHandler()

	// Mobile-first redirect: a phone hitting the bare URL is redirected to
	// the Companion PWA before any auth check happens.  Only the root /
	// and /index.html paths trigger a redirect — assets and named routes
	// continue to fall through to the auth-protected desktop UI so existing
	// behavior for desktop browsers is unaffected.
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if (r.URL.Path == "/" || r.URL.Path == "/index.html") && isMobileUserAgent(r.UserAgent()) {
			http.Redirect(w, r, "/companion/", http.StatusFound)
			return
		}
		rootHandler(w, r)
	})

	// WebSocket terminal handler

	// Initialize components needed by terminal handler
	// Vision system for terminal overlays
	visionRegistry := vision.NewRegistry()
	visionParser := vision.NewParser(8192, visionRegistry)

	// LLM detector for AI CLI tool detection
	llmDetector := llm.NewDetector()

	// Create terminal handler with direct dependencies
	termHandler = terminal.NewHandlerDirect(nil, visionParser, llmDetector)
	http.HandleFunc("/ws", AuthMiddleware(LicenseMiddleware(termHandler.HandleWebSocket)))

	// Server-side macro injection.  Must register AFTER termHandler is set
	// because the handler closure dereferences it.  See handlers_macro.go
	// for why this lives on the backend rather than in the browser.
	registerMacroHandler()

	// Commands API
	http.HandleFunc("/api/commands", WrapWithMiddleware(handleCommands))
	http.HandleFunc("/api/commands/restore-defaults", WrapWithMiddleware(handleRestoreDefaultCommands))
	http.HandleFunc("/api/commands/backups", WrapWithMiddleware(handleCommandBackups)) // Deprecated
	http.HandleFunc("/api/commands/restore-backup", WrapWithMiddleware(handleRestoreBackup)) // Deprecated
	
	// Card History API (new per-card versioning system)
	http.HandleFunc("/api/commands/card-history", WrapWithMiddleware(handleCardHistory))
	http.HandleFunc("/api/commands/card-history/restore", WrapWithMiddleware(handleRestoreCardVersion))
	http.HandleFunc("/api/commands/card-history/init", WrapWithMiddleware(handleInitCardHistory))

	// Config API
	http.HandleFunc("/api/config", WrapWithMiddleware(handleConfig))

	// Notification API
	http.HandleFunc("/api/notify", WrapWithMiddleware(handleNotifySend))
	http.HandleFunc("/api/notify/config", WrapWithMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleNotifyConfigGet(w, r)
		case http.MethodPost:
			handleNotifyConfigPost(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/notify/test", WrapWithMiddleware(handleNotifyTest))
	http.HandleFunc("/api/notify/prompt", WrapWithMiddleware(handleNotifyPrompt))
	http.HandleFunc("/api/notify/respond", handleNotifyRespond) // no auth middleware — accessed by phone browser
	http.HandleFunc("/api/notify/pending", WrapWithMiddleware(handleNotifyPending))
	http.HandleFunc("/api/notify/inbound/poll", WrapWithMiddleware(handleNotifyInboundPoll))

	// Cloudflare tunnel management API
	http.HandleFunc("/api/tunnel/status", WrapWithMiddleware(handleTunnelStatus))
	http.HandleFunc("/api/tunnel/start", WrapWithMiddleware(handleTunnelStart))
	http.HandleFunc("/api/tunnel/stop", WrapWithMiddleware(handleTunnelStop))

	// Hosted mode API — in-app remote access launch
	http.HandleFunc("/api/hosted/status", WrapWithMiddleware(handleHostedStatus))
	http.HandleFunc("/api/hosted/start", WrapWithMiddleware(handleHostedStart))
	http.HandleFunc("/api/hosted/stop", WrapWithMiddleware(handleHostedStop))

	http.HandleFunc("/api/project/release-script", WrapWithMiddleware(handleProjectReleaseScript))
	http.HandleFunc("/api/project/scaffold-release", WrapWithMiddleware(handleProjectScaffoldRelease))
	http.HandleFunc("/api/project/create", WrapWithMiddleware(handleProjectCreate))

	// Setup wizard
	http.HandleFunc("/setup", WrapWithMiddleware(handleSetupWizard))
	http.HandleFunc("/api/setup/check", WrapWithMiddleware(handleSetupCheck))
	http.HandleFunc("/api/setup/install-cloudflared", WrapWithMiddleware(handleSetupInstallCloudflared))
	http.HandleFunc("/api/setup/activate", WrapWithMiddleware(handleSetupActivate))
	http.HandleFunc("/api/tunnel/setup/install", WrapWithMiddleware(handleTunnelSetupInstall))
	http.HandleFunc("/api/tunnel/setup/login", WrapWithMiddleware(handleTunnelSetupLogin))
	http.HandleFunc("/api/tunnel/setup/login/status", WrapWithMiddleware(handleTunnelSetupLoginStatus))
	http.HandleFunc("/api/tunnel/setup/login/cancel", WrapWithMiddleware(handleTunnelSetupLoginCancel))
	http.HandleFunc("/api/tunnel/setup/zones", WrapWithMiddleware(handleTunnelSetupZones))
	http.HandleFunc("/api/tunnel/setup/create", WrapWithMiddleware(handleTunnelSetupCreate))
	http.HandleFunc("/api/tunnel/setup/status", WrapWithMiddleware(handleTunnelSetupStatus))
	http.HandleFunc("/api/tunnel/setup/service", WrapWithMiddleware(handleTunnelService))
	http.HandleFunc("/api/tunnel/setup/restart", WrapWithMiddleware(handleTunnelSetupRestart))
	http.HandleFunc("/api/tunnel/options", WrapWithMiddleware(handleTunnelOptions))
	http.HandleFunc("/api/tunnel/select", WrapWithMiddleware(handleTunnelSelect))
	http.HandleFunc("/api/tunnel/migrate-legacy", WrapWithMiddleware(handleTunnelMigrateLegacy))

	// WSL detection API
	http.HandleFunc("/api/wsl/detect", WrapWithMiddleware(handleWSLDetect))

	// Shutdown API - allows graceful shutdown from browser
	http.HandleFunc("/api/shutdown", WrapWithMiddleware(handleShutdown))
	
	// IDE Integration API - open current workspace in external IDE
	http.HandleFunc("/api/ide/open", WrapWithMiddleware(handleOpenIDE))
	http.HandleFunc("/api/build/detect", WrapWithMiddleware(handleDetectBuildSystem))

	// Version and system info API
	http.HandleFunc("/api/version", WrapWithMiddleware(handleVersion))
	http.HandleFunc("/api/git/version", WrapWithMiddleware(handleGitVersion))
	http.HandleFunc("/api/system-info", WrapWithMiddleware(handleSystemInfo))  // NEW: Process safeguard info
	http.HandleFunc("/api/update/check", WrapWithMiddleware(handleUpdateCheck))
	http.HandleFunc("/api/update/apply", WrapWithMiddleware(handleUpdateApply))
	http.HandleFunc("/api/update/versions", WrapWithMiddleware(handleListVersions))
	http.HandleFunc("/api/update/events", WrapWithMiddleware(handleUpdateEvents))                // SSE for push update notifications
	http.HandleFunc("/api/update/install-manual", WrapWithMiddleware(handleInstallManualUpdate)) // Install manually downloaded binary
	http.HandleFunc("/api/update/set-version", WrapWithMiddleware(handleSetCustomVersion))       // Set custom version number

	// Sessions API - persist tab state across refreshes
	http.HandleFunc("/api/sessions", WrapWithMiddleware(handleSessions))

	// Welcome screen API - track if welcome has been shown
	http.HandleFunc("/api/welcome", WrapWithMiddleware(handleWelcome))

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
	http.HandleFunc("/api/diagnostics/connection", WrapWithMiddleware(handleDiagnosticsConnection))
	http.HandleFunc("/api/diagnostics/internal", WrapWithMiddleware(handleDiagnosticsInternal))

	// Freeze detection API- comprehensive runtime monitoring
	http.HandleFunc("/api/diagnostics/freeze/metrics", WrapWithMiddleware(diagnostic.HandleFreezeMetrics))
	http.HandleFunc("/api/diagnostics/freeze/current", WrapWithMiddleware(diagnostic.HandleFreezeCurrent))
	http.HandleFunc("/api/diagnostics/freeze/stats", WrapWithMiddleware(diagnostic.HandleFreezeStats))
	http.HandleFunc("/api/diagnostics/freeze/gc", WrapWithMiddleware(diagnostic.HandleForceGC))
	http.HandleFunc("/api/diagnostics/freeze/goroutines", WrapWithMiddleware(diagnostic.HandleGoroutines))
	http.HandleFunc("/api/diagnostics/runtime", WrapWithMiddleware(diagnostic.HandleRuntimeStats))

	// Developer Dashboard API
	http.HandleFunc("/api/dashboard/stats", WrapWithMiddleware(handleDashboardStats))

	// Tab theme defaults API
	http.HandleFunc("/api/tab-defaults", WrapWithMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetTabDefaults(w, r)
		case http.MethodPost:
			handleSaveTabDefaults(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

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
	http.HandleFunc("/api/debug-sessions/active", WrapWithMiddleware(handleSetActiveDebugSession)) // v3.12.16
	http.HandleFunc("/api/debug-sessions/", WrapWithMiddleware(handleGetDebugSession))
	
	// PTY Logs API - Get PTY logs for Follow Me integration
	http.HandleFunc("/api/debug/pty-logs", WrapWithMiddleware(handleGetPTYLogs))

	// PTY Injection API - REMOVED in v3.12.17: Replaced by Zero-Click macro system in Command Cards

	// External Logs API - Ingest logs from external apps (Follow Me integration)
	http.HandleFunc("/api/debug-logs", WrapWithMiddleware(handleDebugLogsRouter))
	http.HandleFunc("/api/debug-logs/", WrapWithMiddleware(handleDebugLogsRouter)) // For /{sessionId}

	// Desktop shortcut API
	http.HandleFunc("/api/desktop-shortcut", WrapWithMiddleware(handleDesktopShortcut))

	// Directory Card API - list subdirectories for project navigation
	http.HandleFunc("/api/directory/list", WrapWithMiddleware(handleDirectoryList))

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
	// Error logging API - client-side error reporting
	http.HandleFunc("/api/log-error", WrapWithMiddleware(handleLogError))

	// Open external files (HTML in browser, etc.)
	http.HandleFunc("/api/open-external", WrapWithMiddleware(handleOpenExternal))

	// Temp image upload API
	http.HandleFunc("/api/temp-image", WrapWithMiddleware(handleTempImageUpload))

	// Code Tutor API (v3.19.0: Learn As You Build)
	http.HandleFunc("/api/tutor/sessions", WrapWithMiddleware(handleTutorSessions))
	http.HandleFunc("/api/tutor/sessions/", WrapWithMiddleware(handleTutorSession))
	http.HandleFunc("/api/tutor/navigate", WrapWithMiddleware(handleTutorNavigate))
	http.HandleFunc("/api/tutor/explain", WrapWithMiddleware(handleTutorExplain))
	http.HandleFunc("/api/tutor/learning-path", WrapWithMiddleware(handleTutorLearningPath))
	http.HandleFunc("/api/tutor/settings", WrapWithMiddleware(handleTutorSettings))
	http.HandleFunc("/api/tutor/watcher", WrapWithMiddleware(handleTutorWatcher))
	http.HandleFunc("/api/tutor/recent-changes", WrapWithMiddleware(handleTutorRecentChanges))
	http.HandleFunc("/api/tutor/explain-change", WrapWithMiddleware(handleTutorExplainChange))

	// ── Forge Workflow Architect routes ─────────────────────────────
	http.HandleFunc("/api/workflow/detect", WrapWithMiddleware(handleWorkflowDetect))
	http.HandleFunc("/api/workflow/presets", WrapWithMiddleware(handleWorkflowPresets))
	http.HandleFunc("/api/workflow/preview", WrapWithMiddleware(handleWorkflowPreview))
	http.HandleFunc("/api/workflow/apply", WrapWithMiddleware(handleWorkflowApply))
	http.HandleFunc("/api/workflow/status", WrapWithMiddleware(handleWorkflowStatus))
	http.HandleFunc("/api/workflow/compliance", WrapWithMiddleware(handleWorkflowCompliance))
	http.HandleFunc("/api/workflow/modules", WrapWithMiddleware(handleWorkflowModules))
	http.HandleFunc("/api/workflow/release-preflight", WrapWithMiddleware(handleReleasePreflight))
	http.HandleFunc("/api/workflow/watch", WrapWithMiddleware(handleWorkflowWatchStart))
	http.HandleFunc("/api/workflow/watch/poll", WrapWithMiddleware(handleWorkflowWatchPoll))
	http.HandleFunc("/api/workflow/watch/stop", WrapWithMiddleware(handleWorkflowWatchStop))

	// ── MCP Server routes (own auth, no standard middleware) ──────────────
	// Must be initialised AFTER termHandler is set (line ~282 above).
	initMCPServer()
	http.HandleFunc("/api/mcp", handleMCP)
	http.HandleFunc("/api/mcp/reload", handleMCPReload)
	http.HandleFunc("/api/mcp/tasks/", handleMCPTaskStatus)
	// /api/mcp/ui-status and /api/mcp/ui-tasks both use standard Forge auth
	// (session cookie, not the MCP bearer token) so the frontend panels can
	// poll them without ever exposing the MCP secret to the browser.
	http.HandleFunc("/api/mcp/ui-status", AuthMiddleware(handleMCPUIStatus))
	http.HandleFunc("/api/mcp/ui-tasks", AuthMiddleware(handleMCPUITasks))

	// ── Mobile Companion routes (scoped mobile-token auth + CORS) ─────────
	// The mobile token is separate from the MCP token — it scopes to terminal
	// read/write only and is safe to share with the companion PWA.
	// /api/mobile/settings uses Forge session auth (desktop UI only; no CORS).
	initMobileToken()
	http.HandleFunc("/api/mobile/info", handleMobileInfo)
	http.HandleFunc("/api/mobile/sessions", handleMobileSessions)
	http.HandleFunc("/api/mobile/exec", handleMobileExec)
	http.HandleFunc("/api/mobile/read", handleMobileRead)
	http.HandleFunc("/api/mobile/settings", WrapWithMiddleware(handleMobileSettings))
	http.HandleFunc("/api/companion/preference", WrapWithMiddleware(handleCompanionPreference))

	// ── License routes (always available — bypass LicenseMiddleware) ──────
	http.HandleFunc("/api/license/activate", WrapLicenseHandler(handleLicenseActivate))
	http.HandleFunc("/api/license/status", WrapLicenseHandler(handleLicenseStatus))
	http.HandleFunc("/api/license/deactivate", WrapLicenseHandler(handleLicenseDeactivate))

	// ── Forge Vault routes (AES-256-GCM encrypted secret store) ──────────
	http.HandleFunc("/api/vault/status", WrapWithMiddleware(handleVaultStatus))
	// /api/vault/entries/value is registered before /api/vault/entries so
	// Go's ServeMux resolves the more-specific path first.
	http.HandleFunc("/api/vault/entries/value", WrapWithMiddleware(handleVaultRevealValue))
	http.HandleFunc("/api/vault/entries", WrapWithMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleVaultListEntries(w, r)
		case http.MethodPost:
			handleVaultAddEntry(w, r)
		case http.MethodPut:
			handleVaultUpdateEntry(w, r)
		case http.MethodDelete:
			handleVaultDeleteEntry(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	}))
	http.HandleFunc("/api/vault/auto-inject", WrapWithMiddleware(handleVaultToggleAutoInject))
	http.HandleFunc("/api/vault/inject", WrapWithMiddleware(handleVaultInject))

	// Initialize session temp directory
	if err := initSessionTempDir(); err != nil {
		log.Printf("[ERROR] Failed to initialize session temp dir: %v", err)
	}

	// Find an available port (use override if specified)
	addr, listener, err := findAvailablePort(overrideHost, overridePort)
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

	// Auto-start cloudflared tunnel if configured or hosted mode is active
	go func() {
		cfg, err := loadNotifyConfig()
		shouldStartTunnel := (err == nil && cfg.TunnelAutoStart) || hostedCfg.TunnelAutoStart
		if shouldStartTunnel {
			if startErr := tunnelMgr.Start(buildTunnelStartConfig(), onTunnelURL); startErr != nil {
				log.Printf("[Tunnel] Auto-start failed: %v", startErr)
			} else {
				log.Printf("[Tunnel] Auto-started cloudflared on port %d", activePort)
			}
		}
		// Auto-start the Named Tunnel supervisor if the setup wizard has been
		// completed AND the user's preference is "named" or unset (auto-pick).
		// Guard: only start if the user has not explicitly chosen a different mode
		// (e.g. Tailscale) — we should not expose Forge publicly against their will.
		pref := tunnel.LoadPreference()
		shouldStartNamed := pref.Mode == string(tunnel.ModeIDNamed) || pref.Mode == ""
		if shouldStartNamed {
			startNamedSupervisorIfConfigured(context.Background())
		}
		// Auto-start ntfy inbound poller if transport=ntfy and topic is set
		if err == nil && (cfg.Transport == "ntfy" || cfg.Transport == "") && cfg.NtfyInboundTopic != "" {
			startNtfyInboundPoller(cfg.NtfyServerURL, cfg.NtfyInboundTopic)
		}
	}()
	// Print access URL when running remotely
	if inCodespaces {
		codespaceName := os.Getenv("CODESPACE_NAME")
		domain := os.Getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
		if domain == "" {
			domain = "app.github.dev"
		}
		if _, portStr, err2 := net.SplitHostPort(addr); err2 == nil {
			externalURL := fmt.Sprintf("https://%s-%s.%s", codespaceName, portStr, domain)
			if globalToken != "" {
				externalURL += "?token=" + globalToken
			}
			log.Printf("🌐 External Codespace URL: %s", externalURL)
		}
	} else if globalToken != "" {
		log.Printf("🔗 Remote access URL: http://%s?token=%s", addr, globalToken)
	}

	// In hosted mode, also print stable local-network URLs the user can bookmark.
	// These don't change between restarts as long as the IP and port are stable.
	if hostedCfg.Enabled {
		printLocalNetworkURLs(activePort, globalToken)
	}

	// Handle graceful shutdown
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		log.Println("\n👋 Shutting down Forge...")
		os.Exit(0)
	}()

	// Monitor system power events (sleep/wake) to gracefully handle sessions
	go startPowerEventListener(func() {
		if termHandler != nil {
			count := termHandler.SuspendSessions()
			log.Printf("⚡ Suspended %d terminal sessions before system sleep", count)
		}
	})

	// Auto-open browser (skip if NO_BROWSER env var is set, running in Codespaces, or hosted mode)
	if os.Getenv("NO_BROWSER") == "" && !inCodespaces && !hostedCfg.NoBrowser {
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
		hideWindow(cmd) // Prevent console window flash
	}
	if cmd != nil {
		_ = cmd.Start()
	}
}

// handleOpenExternal opens a file in the system's default application
// Used for HTML files to open in browser, etc.
func handleOpenExternal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	log.Printf("[API] Opening external: %s", req.Path)

	// Resolve path
	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Verify file exists
	if _, err := os.Stat(absPath); err != nil {
		http.Error(w, "File not found: "+absPath, http.StatusNotFound)
		return
	}

	// Detect file type to choose appropriate handler
	ext := strings.ToLower(filepath.Ext(absPath))
	isHTML := ext == ".html" || ext == ".htm"

	// Open with system default application
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		if isHTML {
			// Force browser for HTML files on macOS
			cmd = exec.Command("open", "-a", "Safari", absPath)
		} else {
			cmd = exec.Command("open", absPath)
		}
	case "linux":
		if isHTML {
			// Try xdg-open which should use default browser for HTML
			cmd = exec.Command("xdg-open", absPath)
		} else {
			cmd = exec.Command("xdg-open", absPath)
		}
	case "windows":
		// On Windows, use 'start' with file:// URL for proper handling
		// Clean path for URL format
		urlPath := "file:///" + strings.ReplaceAll(absPath, "\\", "/")
		if isHTML {
			// For HTML, explicitly use browser protocol to avoid VS Code association
			// The http:// trick forces browser even if .html is associated with editor
			cmd = exec.Command("cmd", "/c", "start", "", urlPath)
		} else {
			cmd = exec.Command("cmd", "/c", "start", "", urlPath)
		}
		hideWindow(cmd)
	}

	if cmd != nil {
		if err := cmd.Start(); err != nil {
			log.Printf("[API] Failed to open external: %v", err)
			http.Error(w, "Failed to open: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
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

// printLocalNetworkURLs logs the LAN access URLs for hosted mode so users can
// bookmark a stable address without waiting for Cloudflare tunnel output.
func printLocalNetworkURLs(port int, token string) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil || ip.IsLoopback() || ip.To4() == nil {
				continue
			}
			localURL := fmt.Sprintf("http://%s:%d", ip, port)
			if token != "" {
				localURL += "?token=" + token
			}
			log.Printf("📱 Local network (bookmark this): %s", localURL)
		}
	}
}

// findAvailablePort tries preferred ports in order and returns the first available one.
// If overridePort is specified (> 0), it will try that port first.
// host controls the bind address (e.g. "localhost", "0.0.0.0").
func findAvailablePort(host string, overridePort int) (string, net.Listener, error) {
	// If override port specified, try it first
	if overridePort > 0 {
		addr := fmt.Sprintf("%s:%d", host, overridePort)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			log.Printf("[Dev] Using override port: %d", overridePort)
			return addr, listener, nil
		}
		log.Printf("[Dev] Override port %d unavailable: %v", overridePort, err)
		// Fall through to try preferred ports
	}
	
	for _, port := range preferredPorts {
		addr := fmt.Sprintf("%s:%d", host, port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return addr, listener, nil
		}
		log.Printf("Port %d unavailable, trying next...", port)
	}

	// Fallback: let OS assign a random available port
	listener, err := net.Listen("tcp", fmt.Sprintf("%s:0", host))
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
	hideWindow(cmd) // Prevent console window flash on Windows
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

// getLatestGitTag returns the highest semver tag found across all refs.
// Unlike git-describe, which only walks the current branch's ancestry, this
// query covers tags created on feature branches before they merge to main.
// Returns an empty string when git is unavailable or no semver tags exist.
func getLatestGitTag() string {
	rawOutput, err := exec.Command("git", "tag", "--sort=-version:refname").Output()
	if err != nil {
		return ""
	}
	semverPattern := regexp.MustCompile(`^v\d+\.\d+\.\d+$`)
	for _, rawLine := range strings.Split(string(rawOutput), "\n") {
		trimmedTag := strings.TrimSpace(rawLine)
		if semverPattern.MatchString(trimmedTag) {
			return trimmedTag
		}
	}
	return ""
}

func handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"version":      updater.GetVersion(),
		"latestGitTag": getLatestGitTag(),
	})
}

// handleGitVersion returns the git version (tag) for a specific path
func handleGitVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "Path required", http.StatusBadRequest)
		return
	}

	// Security: Verify path exists
	if _, err := os.Stat(req.Path); os.IsNotExist(err) {
		http.Error(w, "Path does not exist", http.StatusNotFound)
		return
	}

	// Run git describe --tags --abbrev=0
	cmd := exec.Command("git", "describe", "--tags", "--abbrev=0")
	cmd.Dir = req.Path
	hideWindow(cmd) // v3.17.1.1: Prevent console window flash on tab switch
	
	// Check if git directory exists first to avoid fatal errors
	if _, err := os.Stat(filepath.Join(req.Path, ".git")); os.IsNotExist(err) {
		// Not a git repo? Or maybe a subdir.
		// Try running git rev-parse --is-inside-work-tree
		checkCmd := exec.Command("git", "rev-parse", "--is-inside-work-tree")
		checkCmd.Dir = req.Path
		hideWindow(checkCmd) // v3.17.1.1: Prevent console window flash on tab switch
		if err := checkCmd.Run(); err != nil {
			json.NewEncoder(w).Encode(map[string]string{
				"version": "v0.0.0", // Default if not a git repo
				"error": "Not a git repository",
			})
			return
		}
	}

	out, err := cmd.Output()
	version := strings.TrimSpace(string(out))
	
	if err != nil {
		// If no tags exist, git describe fails. Fallback to v0.0.0
		log.Printf("[GitVersion] No tags found or git error in %s: %v", req.Path, err)
		version = "v0.0.0"
	}
	
	// Ensure v prefix
	if !strings.HasPrefix(version, "v") && version != "" {
		version = "v" + version
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"version": version,
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

	// Return cached result if still fresh (avoids burning the 60 req/hour GitHub rate limit)
	cachedUpdateInfoMu.Lock()
	if cachedUpdateInfo != nil && time.Since(cachedUpdateInfoTime) < updateCacheTTL {
		info := cachedUpdateInfo
		cachedUpdateInfoMu.Unlock()
		json.NewEncoder(w).Encode(info)
		return
	}
	cachedUpdateInfoMu.Unlock()

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

	cachedUpdateInfoMu.Lock()
	cachedUpdateInfo = info
	cachedUpdateInfoTime = time.Now()
	cachedUpdateInfoMu.Unlock()

	json.NewEncoder(w).Encode(info)
}

// cachedUpdateInfo holds the last successful CheckForUpdate result and its timestamp.
// Shared between handleUpdateCheck and handleUpdateApply to avoid redundant GitHub API calls
// that quickly exhaust the 60 req/hour unauthenticated rate limit (returning 403).
var (
	cachedUpdateInfo      *updater.UpdateInfo
	cachedUpdateInfoTime  time.Time
	cachedUpdateInfoMu    sync.Mutex
	updateCacheTTL        = 5 * time.Minute
)

func handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Use cached update info to avoid a second GitHub API call on apply
	// (the check already ran when the modal opened or "Check Now" was clicked).
	cachedUpdateInfoMu.Lock()
	info := cachedUpdateInfo
	cachedUpdateInfoMu.Unlock()

	if info == nil || !info.Available {
		// Cache miss or stale — fall back to a fresh check
		var err error
		info, err = updater.CheckForUpdate()
		if err != nil {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		cachedUpdateInfoMu.Lock()
		cachedUpdateInfo = info
		cachedUpdateInfoTime = time.Now()
		cachedUpdateInfoMu.Unlock()
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

// handleSetCustomVersion allows manually setting the version number
// Useful for version skipping, testing, or manual version control
func handleSetCustomVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Parse request body for the version string
	var req struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[Version] Failed to decode request: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid request: " + err.Error(),
		})
		return
	}

	if req.Version == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Version is required",
		})
		return
	}

	// Validate version format (basic check)
	version := strings.TrimSpace(req.Version)
	version = strings.TrimPrefix(version, "v") // Remove v prefix if present

	// Basic semver validation
	versionPattern := `^\d+\.\d+\.\d+(-[\w.]+)?$`
	matched, err := regexp.MatchString(versionPattern, version)
	if err != nil || !matched {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid version format. Expected: X.Y.Z or X.Y.Z-suffix",
		})
		return
	}

	// Update the version in the updater package
	oldVersion := updater.Version
	updater.Version = version
	
	log.Printf("[Version] Custom version set: %s -> %s", oldVersion, version)

	// Send success response
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"oldVersion":  oldVersion,
		"newVersion":  version,
		"message":     fmt.Sprintf("Version updated from %s to %s", oldVersion, version),
	})
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
		hideWindow(cmd) // Prevent console window flash during self-restart
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

// handleCommandBackups handles listing backups or retrieving content of one
func handleCommandBackups(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check for "file" query param to get details
	fileParam := r.URL.Query().Get("file")
	if fileParam != "" {
		cmds, err := commands.GetBackupContent(fileParam)
		if err != nil {
			log.Printf("[Backups] Failed to get content for %s: %v", fileParam, err)
			http.Error(w, "Failed to get backup content: "+err.Error(), http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cmds)
		return
	}

	backups, err := commands.GetBackups()
	if err != nil {
		log.Printf("[Backups] Failed to get backups: %v", err)
		http.Error(w, "Failed to list backups", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backups)
}

// handleRestoreBackup handles restoring a specific backup
func handleRestoreBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		BackupName  string `json:"backupName"`
		SelectedIDs []int  `json:"selectedIds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.BackupName == "" {
		http.Error(w, "Backup name required", http.StatusBadRequest)
		return
	}

	var err error
	if len(req.SelectedIDs) > 0 {
		log.Printf("[Backups] Restoring %d commands from: %s", len(req.SelectedIDs), req.BackupName)
		err = commands.ImportBackup(req.BackupName, req.SelectedIDs)
	} else {
		log.Printf("[Backups] Restoring full backup: %s", req.BackupName)
		err = commands.RestoreBackup(req.BackupName)
	}

	if err != nil {
		log.Printf("[Backups] Restore failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Backup restored successfully",
	})
}

// handleCardHistory handles getting card version history (new system)
func handleCardHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Check if specific card ID requested
	cardIDParam := r.URL.Query().Get("cardId")
	if cardIDParam != "" {
		cardID, err := strconv.Atoi(cardIDParam)
		if err != nil {
			http.Error(w, "Invalid card ID", http.StatusBadRequest)
			return
		}

		history, err := commands.GetCardHistory(cardID)
		if err != nil {
			log.Printf("[CardHistory] Failed to get history for card %d: %v", cardID, err)
			http.Error(w, "Failed to get card history", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
		return
	}

	// Get all card histories
	histories, err := commands.GetAllCardHistories()
	if err != nil {
		log.Printf("[CardHistory] Failed to get all histories: %v", err)
		http.Error(w, "Failed to get card histories", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(histories)
}

// handleRestoreCardVersion handles restoring cards to specific versions
func handleRestoreCardVersion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Restorations map[int]int `json:"restorations"` // cardID -> versionNum
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Restorations) == 0 {
		http.Error(w, "No cards specified for restoration", http.StatusBadRequest)
		return
	}

	log.Printf("[CardHistory] Restoring %d card(s) to specific versions", len(req.Restorations))
	
	if err := commands.RestoreMultipleCardVersions(req.Restorations); err != nil {
		log.Printf("[CardHistory] Restore failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Restored %d card(s) successfully", len(req.Restorations)),
	})
}

// handleInitCardHistory initializes card history for all existing cards
func handleInitCardHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	log.Println("[CardHistory] Initializing card histories...")
	
	if err := commands.InitializeCardHistories(); err != nil {
		log.Printf("[CardHistory] Initialization failed: %v", err)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	log.Println("[CardHistory] Successfully initialized card histories")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Card histories initialized successfully",
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

	forgeDir := os.Getenv("FORGE_DIR")
	if forgeDir == "" {
		homeDir, _ := os.UserHomeDir()
		forgeDir = filepath.Join(homeDir, ".forge")
	}
	visionDir := filepath.Join(forgeDir, "vision")

	insights, err := terminal.LoadVisionInsights(visionDir, tabID)
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

	forgeDir := os.Getenv("FORGE_DIR")
	if forgeDir == "" {
		homeDir, _ := os.UserHomeDir()
		forgeDir = filepath.Join(homeDir, ".forge")
	}
	visionDir := filepath.Join(forgeDir, "vision")

	insights, err := terminal.LoadVisionInsights(visionDir, tabID)
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
	platform := svc.GetPlatformInfo()
	events := svc.GetEvents(50)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":       "ok",
		"platform":     platform,
		"recentEvents": len(events),
	})
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

