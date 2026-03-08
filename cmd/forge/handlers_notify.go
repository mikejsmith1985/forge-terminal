package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// ── Notification config ──────────────────────────────────────────────────────

// NotifyConfig holds user-configured notification settings.
type NotifyConfig struct {
	WebhookURL           string `json:"webhookURL"`
	WebhookSecret        string `json:"webhookSecret"`
	IdleDetectionEnabled bool   `json:"idleDetectionEnabled"`
	IdleTimeoutSeconds   int    `json:"idleTimeoutSeconds"`
}

func defaultNotifyConfig() NotifyConfig {
	return NotifyConfig{
		IdleDetectionEnabled: false,
		IdleTimeoutSeconds:   30,
	}
}

func notifyConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".forge", "notifications.json"), nil
}

func loadNotifyConfig() (NotifyConfig, error) {
	cfg := defaultNotifyConfig()
	path, err := notifyConfigPath()
	if err != nil {
		return cfg, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return cfg, nil
	}
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

func saveNotifyConfig(cfg NotifyConfig) error {
	path, err := notifyConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

// ── Transport interface (future-proof for Twilio, etc.) ──────────────────────

// NotificationSender is the interface all transports must satisfy.
type NotificationSender interface {
	Send(message, sender string) error
}

// mbl2pcSender sends notifications to an mbl2pc /webhook endpoint.
type mbl2pcSender struct {
	webhookURL    string
	webhookSecret string
}

type mbl2pcWebhookPayload struct {
	Text   string `json:"text"`
	Token  string `json:"token"`
	Sender string `json:"sender"`
}

func (s *mbl2pcSender) Send(message, sender string) error {
	payload := mbl2pcWebhookPayload{
		Text:   message,
		Token:  s.webhookSecret,
		Sender: sender,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}
	resp, err := http.Post(s.webhookURL+"/webhook", "application/json", bytes.NewReader(body)) //nolint:gosec
	if err != nil {
		return fmt.Errorf("POST /webhook failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("webhook returned %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// newSenderFromConfig builds the right transport from the current config.
// Currently only mbl2pc is supported; Twilio/others can be added here.
func newSenderFromConfig(cfg NotifyConfig) (NotificationSender, error) {
	if cfg.WebhookURL == "" || cfg.WebhookSecret == "" {
		return nil, fmt.Errorf("notification not configured: webhookURL and webhookSecret are required")
	}
	return &mbl2pcSender{
		webhookURL:    cfg.WebhookURL,
		webhookSecret: cfg.WebhookSecret,
	}, nil
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

// handleNotifySend handles POST /api/notify
// Body: {"message": "...", "sender": "Forge Terminal"}
func handleNotifySend(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Message string `json:"message"`
		Sender  string `json:"sender"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Message == "" {
		req.Message = "Forge Terminal is waiting for your response."
	}
	if req.Sender == "" {
		req.Sender = "Forge Terminal"
	}

	cfg, err := loadNotifyConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sender, err := newSenderFromConfig(cfg)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := sender.Send(req.Message, req.Sender); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "delivered"})
}

// handleNotifyConfigGet handles GET /api/notify/config
// Returns config with secret masked.
func handleNotifyConfigGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := loadNotifyConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	// Mask secret — never send plaintext to frontend
	masked := cfg
	if masked.WebhookSecret != "" {
		masked.WebhookSecret = "••••••••"
	}
	writeJSON(w, http.StatusOK, masked)
}

// handleNotifyConfigPost handles POST /api/notify/config
// Saves config; if secret is the mask value, keep the existing secret.
func handleNotifyConfigPost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var incoming NotifyConfig
	if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Load existing config to preserve the secret if the frontend sent the mask
	existing, _ := loadNotifyConfig()
	if incoming.WebhookSecret == "••••••••" {
		incoming.WebhookSecret = existing.WebhookSecret
	}
	if incoming.IdleTimeoutSeconds <= 0 {
		incoming.IdleTimeoutSeconds = 30
	}
	if err := saveNotifyConfig(incoming); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// handleNotifyTest handles POST /api/notify/test
// Sends a canned test message.
func handleNotifyTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cfg, err := loadNotifyConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sender, err := newSenderFromConfig(cfg)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := sender.Send("🔔 Forge Terminal notifications are working!", "Forge Terminal"); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "test delivered"})
}

// writeJSON is a small helper to write JSON responses.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
