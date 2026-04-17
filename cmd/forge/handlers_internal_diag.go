package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type internalDiagResponse struct {
	OK               bool     `json:"ok"`
	GoroutineCount   int      `json:"goroutineCount"`
	HeapAllocMB      float64  `json:"heapAllocMB"`
	HeapSysMB        float64  `json:"heapSysMB"`
	NumGC            uint32   `json:"numGC"`
	LastGCPauseMs    float64  `json:"lastGCPauseMs"`
	ShellFound       string   `json:"shellFound"`
	ShellAvailable   bool     `json:"shellAvailable"`
	PTYDevice        string   `json:"ptyDevice"`
	PTYAvailable     bool     `json:"ptyAvailable"`
	PTYSpawnOK       *bool    `json:"ptySpawnOk,omitempty"`    // nil when test was not requested
	PTYSpawnError    string   `json:"ptySpawnError,omitempty"` // set when spawn test fails
	JournalDirOK     bool     `json:"journalDirOK"`
	JournalDirPath   string   `json:"journalDirPath"`
	LiveSessions     int      `json:"liveSessions"`
	DetachedSessions int      `json:"detachedSessions"`
	LiveHubs         int      `json:"liveHubs"`
	Warnings         []string `json:"warnings"`
}

// handleDiagnosticsInternal performs a deep internal health check of the Forge
// process itself.  It surfaces issues that would cause "terminal won't connect"
// even when the HTTP and WebSocket layers are healthy — goroutine leaks, memory
// pressure, missing shells, unwritable journal directories, and zombie sessions.
func handleDiagnosticsInternal(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	goroutines := runtime.NumGoroutine()
	heapAllocMB := float64(memStats.HeapAlloc) / (1024 * 1024)
	heapSysMB := float64(memStats.HeapSys) / (1024 * 1024)
	// PauseNs is a circular buffer; the most recent pause is at index NumGC%256.
	lastGCPauseMs := float64(memStats.PauseNs[(memStats.NumGC+255)%256]) / 1e6

	// ── Shell detection ───────────────────────────────────────────────────────
	// If no shell is found, every PTY spawn will fail immediately.
	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = []string{"powershell.exe", "pwsh.exe", "cmd.exe", "bash.exe"}
	} else {
		candidates = []string{"bash", "sh", "zsh", "fish"}
	}
	shellFound := ""
	shellAvailable := false
	for _, s := range candidates {
		if p, err := exec.LookPath(s); err == nil {
			shellFound = p
			shellAvailable = true
			break
		}
	}

	// ── PTY device ────────────────────────────────────────────────────────────
	// Linux/macOS: /dev/ptmx must be accessible.
	// Windows: ConPTY is a kernel feature; check that conhost.exe is present as
	// a proxy for ConPTY availability.
	ptyDevice := ""
	ptyAvailable := false
	switch runtime.GOOS {
	case "linux", "darwin", "freebsd":
		ptyDevice = "/dev/ptmx"
		if _, err := os.Stat("/dev/ptmx"); err == nil {
			ptyAvailable = true
		}
	case "windows":
		ptyDevice = "ConPTY (kernel)"
		conhostPath := `C:\Windows\System32\conhost.exe`
		if _, err := os.Stat(conhostPath); err == nil {
			ptyAvailable = true
			ptyDevice = conhostPath
		} else {
			// ConPTY may still be available even without a standalone conhost.exe
			// on newer Windows builds; mark as assumed-available.
			ptyAvailable = true
			ptyDevice = "ConPTY (kernel, conhost.exe not found but assumed available)"
		}
	default:
		ptyDevice = "unknown"
		ptyAvailable = false
	}

	// ── Session journal directory ─────────────────────────────────────────────
	journalDir := filepath.Join("logs", "sessions")
	journalDirOK := false
	if err := os.MkdirAll(journalDir, 0755); err == nil {
		probe := filepath.Join(journalDir, ".diag-write-probe")
		if f, err := os.Create(probe); err == nil {
			f.Close()
			os.Remove(probe)
			journalDirOK = true
		}
	}
	absJournalDir, _ := filepath.Abs(journalDir)

	// ── Optional PTY spawn test ──────────────────────────────────────────────
	// Pass ?ptyTest=true to actually attempt spawning (and immediately closing)
	// a PTY. This verifies the full CreateProcess / ConPTY pipeline, which the
	// other checks above cannot test. Opt-in because it briefly starts a shell.
	var ptySpawnOKPtr *bool
	ptySpawnErrMsg := ""
	if r.URL.Query().Get("ptyTest") == "true" && termHandler != nil {
		ptySpawnResult := true
		ptySpawnOKPtr = &ptySpawnResult
		if spawnErr := termHandler.TestPTYSpawn(); spawnErr != nil {
			*ptySpawnOKPtr = false
			ptySpawnErrMsg = spawnErr.Error()
		}
	}

	// ── Session counts ────────────────────────────────────────────────────────
	liveSessions, detachedSessions, liveHubs := 0, 0, 0
	if termHandler != nil {
		termHandler.RangeSessions(func(_ string) bool {
			liveSessions++
			return true
		})
		detachedSessions = termHandler.DetachedSessionCount()
		liveHubs = termHandler.HubCount()
	}

	// ── Build warnings ────────────────────────────────────────────────────────
	ok := true
	var warnings []string

	if goroutines > 2000 {
		ok = false
		warnings = append(warnings, fmt.Sprintf(
			"CRITICAL: goroutine count is %d — severe goroutine leak. New connections will fail or hang. Restart Forge immediately.",
			goroutines))
	} else if goroutines > 800 {
		warnings = append(warnings, fmt.Sprintf(
			"Elevated goroutine count (%d). This may indicate a slow goroutine leak. Monitor and restart if it keeps climbing.",
			goroutines))
	}

	if heapAllocMB > 750 {
		ok = false
		warnings = append(warnings, fmt.Sprintf(
			"High heap allocation (%.0f MB). Memory pressure may cause connection timeouts or OOM crashes. Restart Forge.",
			heapAllocMB))
	} else if heapAllocMB > 400 {
		warnings = append(warnings, fmt.Sprintf(
			"Elevated heap usage (%.0f MB). Watch for further growth.",
			heapAllocMB))
	}

	if lastGCPauseMs > 200 {
		warnings = append(warnings, fmt.Sprintf(
			"Last GC stop-the-world pause was %.1f ms. Long pauses can cause WebSocket read timeouts.",
			lastGCPauseMs))
	}

	if !shellAvailable {
		ok = false
		warnings = append(warnings, "No shell found in PATH. Every PTY session will fail to spawn. "+
			"Ensure bash, sh, or powershell.exe is on PATH, or configure a shell in forge.toml.")
	}

	if !ptyAvailable {
		ok = false
		warnings = append(warnings, "PTY device unavailable ("+ptyDevice+"). "+
			"Terminal sessions cannot be created. On Linux ensure /dev/ptmx is accessible.")
	}

	if !journalDirOK {
		warnings = append(warnings, "Session journal directory is not writable ("+absJournalDir+"). "+
			"Session recovery after disconnect will not work. Check file permissions.")
	}

	if ptySpawnOKPtr != nil && !*ptySpawnOKPtr {
		ok = false
		warnings = append(warnings, "PTY spawn test FAILED: "+ptySpawnErrMsg+". "+
			"Terminal connections will fail. Common causes: saved working directory no longer exists, "+
			"antivirus blocking process creation, or insufficient permissions.")
	}

	if detachedSessions > 20 {
		warnings = append(warnings, fmt.Sprintf(
			"%d sessions are in the grace-period queue (disconnected but PTY still alive). "+
				"This is normal if many clients recently disconnected; they expire automatically.",
			detachedSessions))
	}

	// Hub/session mismatch can indicate a bug where hubs are leaking without sessions.
	if liveHubs > liveSessions+detachedSessions+5 {
		warnings = append(warnings, fmt.Sprintf(
			"Hub count (%d) exceeds session count (%d active + %d detached). "+
				"This may indicate a hub leak — sessions closed without cleaning up their hub.",
			liveHubs, liveSessions, detachedSessions))
	}

	resp := internalDiagResponse{
		OK:               ok,
		GoroutineCount:   goroutines,
		HeapAllocMB:      heapAllocMB,
		HeapSysMB:        heapSysMB,
		NumGC:            memStats.NumGC,
		LastGCPauseMs:    lastGCPauseMs,
		ShellFound:       shellFound,
		ShellAvailable:   shellAvailable,
		PTYDevice:        ptyDevice,
		PTYAvailable:     ptyAvailable,
		PTYSpawnOK:       ptySpawnOKPtr,
		PTYSpawnError:    ptySpawnErrMsg,
		JournalDirOK:     journalDirOK,
		JournalDirPath:   absJournalDir,
		LiveSessions:     liveSessions,
		DetachedSessions: detachedSessions,
		LiveHubs:         liveHubs,
		Warnings:         warnings,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
