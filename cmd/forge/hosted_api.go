package main

import (
	"encoding/base64"
	"net/http"

	qrcode "github.com/skip2/go-qrcode"
)

type hostedStatusResponse struct {
	Running      bool   `json:"running"`
	TunnelURL    string `json:"tunnelURL"`
	AccessURL    string `json:"accessURL"`
	Token        string `json:"token"`
	QRCodeBase64 string `json:"qrCodeBase64,omitempty"`
}

func buildHostedStatus() hostedStatusResponse {
	running, tunnelURL, _ := tunnelMgr.Status()
	accessURL := tunnelURL
	qrBase64 := ""
	if tunnelURL != "" {
		if globalToken != "" {
			accessURL = tunnelURL + "?token=" + globalToken
		}
		if pngBytes, err := qrcode.Encode(accessURL, qrcode.Medium, 300); err == nil {
			qrBase64 = base64.StdEncoding.EncodeToString(pngBytes)
		}
	}
	return hostedStatusResponse{
		Running:      running,
		TunnelURL:    tunnelURL,
		AccessURL:    accessURL,
		Token:        globalToken,
		QRCodeBase64: qrBase64,
	}
}

// handleHostedStatus handles GET /api/hosted/status
func handleHostedStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, buildHostedStatus())
}

// handleHostedStart handles POST /api/hosted/start
// Ensures a token exists (generating one if needed) and starts the Cloudflare tunnel.
// If a token was just generated, it is set as a cookie on the response so the
// current browser session is not immediately locked out.
func handleHostedStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Generate token if auth is not yet enabled, and grant the current session access.
	if globalToken == "" {
		SetAuthToken(GenerateToken())
		isSecure := r.Header.Get("X-Forwarded-Proto") == "https" || r.TLS != nil
		http.SetCookie(w, &http.Cookie{
			Name:     "forge_token",
			Value:    globalToken,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			Secure:   isSecure,
		})
	}

	if !tunnelMgr.IsRunning() {
		if err := tunnelMgr.Start(activePort, onTunnelURL); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
	}

	writeJSON(w, http.StatusOK, buildHostedStatus())
}

// handleHostedStop handles POST /api/hosted/stop
func handleHostedStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tunnelMgr.Stop()
	writeJSON(w, http.StatusOK, buildHostedStatus())
}
