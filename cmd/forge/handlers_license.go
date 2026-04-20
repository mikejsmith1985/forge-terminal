package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/license"
)

// handleLicenseStatus returns the cached license status.
// Always returns 200 — the body carries the status field.
func handleLicenseStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type statusResponse struct {
		Status    string `json:"status"`
		Email     string `json:"email,omitempty"`
		ExpiresAt string `json:"expiresAt,omitempty"`
	}

	w.Header().Set("Content-Type", "application/json")

	// Re-read the global set at startup; it may have been refreshed by the heartbeat.
	// For simplicity we return the startup snapshot — the UI reloads after activation.
	if activeLicenseStatus == license.StatusOK || activeLicenseStatus == license.StatusGrace {
		resp := statusResponse{Status: string(activeLicenseStatus)}
		if activeLicenseInfo != nil {
			resp.Email = activeLicenseInfo.Email
			if !activeLicenseInfo.ExpiresAt.IsZero() {
				resp.ExpiresAt = activeLicenseInfo.ExpiresAt.Format("2006-01-02")
			}
		}
		json.NewEncoder(w).Encode(resp)
		return
	}

	json.NewEncoder(w).Encode(statusResponse{Status: string(activeLicenseStatus)})
}

// handleLicenseActivate activates a license key for this machine.
// On success it updates the in-process globals so a page reload picks up the new state.
func handleLicenseActivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	if req.Key == "" {
		http.Error(w, "'key' is required", http.StatusBadRequest)
		return
	}

	info, err := license.Activate(req.Key)
	if err != nil {
		log.Printf("[License API] Activate error: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Update in-process state so the heartbeat starts on the next server restart.
	// The frontend reloads the page after activation, picking up the new status.
	activeLicenseStatus = license.StatusOK
	activeLicenseInfo = info
	licenseGated = false
	go license.StartHeartbeat(info)

	log.Printf("[License API] Activated: key=%s email=%s machine=%s", req.Key, info.Email, license.MachineID())

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
		"email":  info.Email,
	})
}

// handleLicenseDeactivate removes this machine from the license.
func handleLicenseDeactivate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if activeLicenseInfo == nil {
		http.Error(w, "no active license", http.StatusBadRequest)
		return
	}

	if err := license.Deactivate(activeLicenseInfo); err != nil {
		log.Printf("[License API] Deactivate error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	activeLicenseStatus = license.StatusRequired
	activeLicenseInfo = nil
	licenseGated = true

	log.Printf("[License API] Deactivated machine=%s", license.MachineID())
	w.WriteHeader(http.StatusNoContent)
}
