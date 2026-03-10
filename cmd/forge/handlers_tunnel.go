package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// Global tunnel manager — one instance for the lifetime of the process.
var tunnelMgr = &tunnel.Manager{}

// ── Render API helpers ────────────────────────────────────────────────────────

type renderEnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// renderHTTPClient is used for outbound Render API calls.
// A 15-second timeout prevents goroutine leaks when the API is slow or unreachable.
var renderHTTPClient = &http.Client{Timeout: 15 * time.Second}

// updateRenderEnvVar GETs all env vars for the service, upserts key=value,
// and PUTs the updated list back.  Requires a Render v1 API key.
func updateRenderEnvVar(apiKey, serviceID, key, value string) error {
	baseURL := fmt.Sprintf("https://api.render.com/v1/services/%s/env-vars", serviceID)

	// 1. GET current env vars
	getReq, _ := http.NewRequest(http.MethodGet, baseURL, nil)
	getReq.Header.Set("Authorization", "Bearer "+apiKey)
	getReq.Header.Set("Accept", "application/json")

	resp, err := renderHTTPClient.Do(getReq)
	if err != nil {
		return fmt.Errorf("GET env-vars failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Render GET returned %d: %s", resp.StatusCode, string(body))
	}

	// Render returns either [{key,value}] directly or wrapped — handle both.
	var vars []renderEnvVar
	if err := json.Unmarshal(body, &vars); err != nil {
		// Try wrapped format {"envVars": [...]}
		var wrapped struct {
			EnvVars []renderEnvVar `json:"envVars"`
		}
		if err2 := json.Unmarshal(body, &wrapped); err2 == nil {
			vars = wrapped.EnvVars
		}
		// If both fail, start fresh — just upsert the one key
	}

	// 2. Upsert key
	found := false
	for i, v := range vars {
		if v.Key == key {
			vars[i].Value = value
			found = true
			break
		}
	}
	if !found {
		vars = append(vars, renderEnvVar{Key: key, Value: value})
	}

	// 3. PUT updated list
	putBody, _ := json.Marshal(vars)
	putReq, _ := http.NewRequest(http.MethodPut, baseURL, strings.NewReader(string(putBody)))
	putReq.Header.Set("Authorization", "Bearer "+apiKey)
	putReq.Header.Set("Content-Type", "application/json")
	putReq.Header.Set("Accept", "application/json")

	putResp, err := renderHTTPClient.Do(putReq)
	if err != nil {
		return fmt.Errorf("PUT env-vars failed: %w", err)
	}
	defer putResp.Body.Close()
	putRespBody, _ := io.ReadAll(putResp.Body)

	if putResp.StatusCode >= 400 {
		return fmt.Errorf("Render PUT returned %d: %s", putResp.StatusCode, string(putRespBody))
	}
	return nil
}

// onTunnelURL is called by the tunnel manager whenever a new URL is detected.
// It updates the local baseURL config and pushes the new FORGE_INBOUND_URL to Render.
func onTunnelURL(url string) {
	cfg, err := loadNotifyConfig()
	if err != nil {
		return
	}

	// Update baseURL locally
	cfg.BaseURL = url
	_ = saveNotifyConfig(cfg)

	// Push to Render if configured
	if cfg.RenderAPIKey != "" && cfg.RenderServiceID != "" {
		if err := updateRenderEnvVar(cfg.RenderAPIKey, cfg.RenderServiceID, "FORGE_INBOUND_URL", url); err != nil {
			tunnelMgr.SetError("Render update failed: " + err.Error())
		} else {
			tunnelMgr.SetError("") // clear any previous error
		}
	}
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

// handleTunnelStatus handles GET /api/tunnel/status
func handleTunnelStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	running, url, lastErr := tunnelMgr.Status()
	writeJSON(w, http.StatusOK, map[string]any{
		"running": running,
		"url":     url,
		"error":   lastErr,
	})
}

// handleTunnelStart handles POST /api/tunnel/start
func handleTunnelStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if tunnelMgr.IsRunning() {
		running, url, lastErr := tunnelMgr.Status()
		writeJSON(w, http.StatusOK, map[string]any{"running": running, "url": url, "error": lastErr})
		return
	}
	if err := tunnelMgr.Start(activePort, onTunnelURL); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"running": true, "url": "", "error": ""})
}

// handleTunnelStop handles POST /api/tunnel/stop
func handleTunnelStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tunnelMgr.Stop()
	writeJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}
