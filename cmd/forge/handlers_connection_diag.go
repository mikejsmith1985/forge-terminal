package main

import (
	"encoding/json"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/updater"
)

// connectionDiagResponse is the payload returned by GET /api/diagnostics/connection.
// It gives the frontend enough data to determine why a WebSocket terminal session
// might fail to connect.
type connectionDiagResponse struct {
	OK                bool    `json:"ok"`
	Version           string  `json:"version"`
	Port              int     `json:"port"`
	PID               int     `json:"pid"`
	UptimeSec         float64 `json:"uptimeSec"`
	ActivePtySessions int     `json:"activePtySessions"`
	GOOS              string  `json:"goos"`
	GOArch            string  `json:"goArch"`
	GOVersion         string  `json:"goVersion"`
	AuthEnabled       bool    `json:"authEnabled"`
	ServerTime        string  `json:"serverTime"`
	WSEndpoint        string  `json:"wsEndpoint"`
}

// handleDiagnosticsConnection returns a lightweight server-health snapshot
// that the Connection Diagnostics tool uses to verify the backend is reachable,
// authenticated, and ready to accept WebSocket upgrades.
func handleDiagnosticsConnection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	activeSessions := 0
	if termHandler != nil {
		termHandler.RangeSessions(func(_ string) bool {
			activeSessions++
			return true
		})
	}

	wsScheme := "ws"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		wsScheme = "wss"
	}
	host := r.Host
	if host == "" {
		host = "localhost:" + strconv.Itoa(activePort)
	}

	resp := connectionDiagResponse{
		OK:                true,
		Version:           updater.GetVersion(),
		Port:              activePort,
		PID:               os.Getpid(),
		UptimeSec:         time.Since(serverStartTime).Seconds(),
		ActivePtySessions: activeSessions,
		GOOS:              runtime.GOOS,
		GOArch:            runtime.GOARCH,
		GOVersion:         runtime.Version(),
		AuthEnabled:       globalToken != "",
		ServerTime:        time.Now().UTC().Format(time.RFC3339),
		WSEndpoint:        wsScheme + "://" + host + "/ws",
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
