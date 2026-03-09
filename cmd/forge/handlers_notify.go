package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ── Notification config ──────────────────────────────────────────────────────

// NotifyConfig holds user-configured notification settings.
type NotifyConfig struct {
	WebhookURL           string `json:"webhookURL"`
	WebhookSecret        string `json:"webhookSecret"`
	IdleDetectionEnabled bool   `json:"idleDetectionEnabled"`
	IdleTimeoutSeconds   int    `json:"idleTimeoutSeconds"`
	// BaseURL is the externally-reachable base URL of this Forge instance.
	// When set, response URLs are embedded in notifications so the user can
	// reply remotely without touching the PC.
	BaseURL string `json:"baseURL"`

	// Tunnel automation — auto-manage a cloudflared quick tunnel so the
	// public URL is always kept in sync with Render's FORGE_INBOUND_URL.
	TunnelAutoStart  bool   `json:"tunnelAutoStart"`
	RenderAPIKey     string `json:"renderAPIKey"`
	RenderServiceID  string `json:"renderServiceID"`
}

func defaultNotifyConfig() NotifyConfig {
	return NotifyConfig{
		IdleDetectionEnabled: true,
		IdleTimeoutSeconds:   30,
	}
}

// maskSecret returns "••••••••" if s is non-empty, otherwise "".
func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	return "••••••••"
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
		masked.WebhookSecret = maskSecret(masked.WebhookSecret)
	}
	if masked.RenderAPIKey != "" {
		masked.RenderAPIKey = maskSecret(masked.RenderAPIKey)
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
	// Load existing config to preserve secrets if the frontend sent the mask
	existing, _ := loadNotifyConfig()
	if incoming.WebhookSecret == maskSecret("x") {
		incoming.WebhookSecret = existing.WebhookSecret
	}
	if incoming.RenderAPIKey == maskSecret("x") {
		incoming.RenderAPIKey = existing.RenderAPIKey
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

// ── Inbound message buffer (replies from MBL2PC) ─────────────────────────────

// InboundMessage is a message sent by the user from the MBL2PC UI, forwarded
// to Forge so the agent can receive replies without the user touching the PC.
type InboundMessage struct {
	ID        string    `json:"id"`
	Text      string    `json:"text"`
	Sender    string    `json:"sender"`
	Timestamp time.Time `json:"timestamp"`
}

const inboundBufferCap = 100

var (
	inboundMessages   []InboundMessage
	inboundMessagesMu sync.Mutex
)

// handleNotifyInbound handles POST /api/notify/inbound
// Called by MBL2PC when the user sends a message, or by any trusted caller.
// Body: {"text":"...","sender":"...","token":"..."}
func handleNotifyInbound(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Text   string `json:"text"`
		Sender string `json:"sender"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Auth: token must match webhookSecret
	cfg, err := loadNotifyConfig()
	if err != nil || cfg.WebhookSecret == "" || req.Token != cfg.WebhookSecret {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if req.Text == "" {
		http.Error(w, "text is required", http.StatusBadRequest)
		return
	}

	msg := InboundMessage{
		ID:        randomHex(8),
		Text:      req.Text,
		Sender:    req.Sender,
		Timestamp: time.Now(),
	}

	inboundMessagesMu.Lock()
	inboundMessages = append(inboundMessages, msg)
	if len(inboundMessages) > inboundBufferCap {
		inboundMessages = inboundMessages[len(inboundMessages)-inboundBufferCap:]
	}
	inboundMessagesMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"status": "received", "id": msg.ID})
}

// handleNotifyInboundPoll handles GET /api/notify/inbound/poll?since=<id>
// Frontend polls this to receive messages forwarded from MBL2PC.
// Returns messages added after the given ID (or all recent if no ID given).
func handleNotifyInboundPoll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	sinceID := r.URL.Query().Get("since")

	inboundMessagesMu.Lock()
	var result []InboundMessage
	if sinceID == "" {
		// Return nothing on first poll — establishes the baseline
		result = []InboundMessage{}
	} else {
		found := false
		for i, m := range inboundMessages {
			if m.ID == sinceID {
				result = inboundMessages[i+1:]
				found = true
				break
			}
		}
		if !found {
			// sinceID not in buffer (cleared/restarted) — return last 5 as safety net
			if len(inboundMessages) > 5 {
				result = inboundMessages[len(inboundMessages)-5:]
			} else {
				result = inboundMessages
			}
		}
	}
	// Snapshot to avoid holding the lock while marshalling
	snapshot := make([]InboundMessage, len(result))
	copy(snapshot, result)
	inboundMessagesMu.Unlock()

	// Also return the latest ID the client should track going forward
	lastID := ""
	if len(inboundMessages) > 0 {
		inboundMessagesMu.Lock()
		lastID = inboundMessages[len(inboundMessages)-1].ID
		inboundMessagesMu.Unlock()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"messages": snapshot,
		"lastId":   lastID,
	})
}

// PendingPrompt represents a dialog waiting for a remote user response.
type PendingPrompt struct {
	ID        string    `json:"id"`
	Kind      string    `json:"kind"`    // e.g. "file-access"
	Message   string    `json:"message"` // human-readable question
	Options   []string  `json:"options"` // machine values, e.g. ["restricted","unrestricted"]
	Labels    []string  `json:"labels"`  // display names aligned with Options
	Token     string    `json:"-"`       // one-time secret embedded in response URLs
	Response  string    `json:"response"`
	Resolved  bool      `json:"resolved"`
	ExpiresAt time.Time `json:"expiresAt"`
}

var (
	pendingPrompts   = make(map[string]*PendingPrompt)
	pendingPromptsMu sync.Mutex
)

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// handleNotifyPrompt handles POST /api/notify/prompt
// Creates a pending prompt, sends an enriched notification with response URLs (if BaseURL configured).
// Body: {"kind":"file-access","message":"...","options":["restricted","unrestricted"],"labels":["Project-Scoped","Full Access"]}
// Returns: {"promptId":"..."}
func handleNotifyPrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Kind    string   `json:"kind"`
		Message string   `json:"message"`
		Options []string `json:"options"`
		Labels  []string `json:"labels"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Kind == "" || len(req.Options) == 0 {
		http.Error(w, "kind and options are required", http.StatusBadRequest)
		return
	}
	if len(req.Labels) != len(req.Options) {
		req.Labels = req.Options
	}

	promptID := randomHex(8)
	token := randomHex(16)
	prompt := &PendingPrompt{
		ID:        promptID,
		Kind:      req.Kind,
		Message:   req.Message,
		Options:   req.Options,
		Labels:    req.Labels,
		Token:     token,
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}

	pendingPromptsMu.Lock()
	pendingPrompts[promptID] = prompt
	pendingPromptsMu.Unlock()

	// Send notification — enrich with response URLs if BaseURL is configured.
	cfg, _ := loadNotifyConfig()
	sender, err := newSenderFromConfig(cfg)
	if err == nil {
		notifyMsg := req.Message
		if cfg.BaseURL != "" {
			notifyMsg += "\n\nTap to respond:"
			for i, opt := range req.Options {
				label := opt
				if i < len(req.Labels) {
					label = req.Labels[i]
				}
				notifyMsg += fmt.Sprintf(
					"\n▶ %s\n%s/api/notify/respond?id=%s&choice=%s&token=%s",
					label, cfg.BaseURL, promptID, opt, token,
				)
			}
		}
		_ = sender.Send(notifyMsg, "Forge Terminal")
	}

	writeJSON(w, http.StatusOK, map[string]string{"promptId": promptID})
}

// handleNotifyRespond handles GET /api/notify/respond?id=...&choice=...&token=...
// Called when the user taps a response URL from their phone.
// Returns a friendly HTML confirmation page.
func handleNotifyRespond(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	choice := r.URL.Query().Get("choice")
	token := r.URL.Query().Get("token")

	pendingPromptsMu.Lock()
	defer pendingPromptsMu.Unlock()

	prompt, ok := pendingPrompts[id]
	if !ok {
		writeRespondPage(w, false, "Unknown or expired prompt.", "")
		return
	}
	if time.Now().After(prompt.ExpiresAt) {
		delete(pendingPrompts, id)
		writeRespondPage(w, false, "This prompt has expired. Please respond locally in Forge.", "")
		return
	}
	if prompt.Token != token {
		w.WriteHeader(http.StatusUnauthorized)
		writeRespondPage(w, false, "Invalid token. Response not accepted.", "")
		return
	}
	if prompt.Resolved {
		writeRespondPage(w, true, "Already resolved.", prompt.Response)
		return
	}

	// Validate choice is in options
	valid := false
	for _, opt := range prompt.Options {
		if opt == choice {
			valid = true
			break
		}
	}
	if !valid {
		writeRespondPage(w, false, "Invalid choice.", "")
		return
	}

	prompt.Response = choice
	prompt.Resolved = true

	// Find display label for the chosen option
	label := choice
	for i, opt := range prompt.Options {
		if opt == choice && i < len(prompt.Labels) {
			label = prompt.Labels[i]
			break
		}
	}
	writeRespondPage(w, true, "Response recorded. You may close this page.", label)
}

// writeRespondPage returns a clean mobile-friendly HTML confirmation page.
func writeRespondPage(w http.ResponseWriter, success bool, msg, choice string) {
	icon := "✅"
	color := "#22c55e"
	if !success {
		icon = "❌"
		color = "#ef4444"
	}
	choiceHTML := ""
	if choice != "" {
		choiceHTML = fmt.Sprintf(`<p style="font-size:1.1em;margin-top:12px;color:#ccc;">Selected: <strong style="color:#fff">%s</strong></p>`, choice)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Forge Terminal</title>
<style>body{background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{background:#1a1a1a;border-radius:16px;padding:32px 24px;max-width:360px;width:90%%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);}
h1{font-size:3em;margin:0 0 12px}p{color:#aaa;line-height:1.5;margin:0}</style></head>
<body><div class="card"><h1>%s</h1><p style="color:%s;font-weight:600;font-size:1.2em">%s</p>%s</div></body></html>`,
		icon, color, msg, choiceHTML)
}

// handleNotifyPending handles GET /api/notify/pending?id=...
// Frontend polls this to learn when a remote response has arrived.
// Returns: {"resolved":false} or {"resolved":true,"choice":"restricted"}
func handleNotifyPending(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	pendingPromptsMu.Lock()
	prompt, ok := pendingPrompts[id]
	if ok && !prompt.Resolved && time.Now().After(prompt.ExpiresAt) {
		delete(pendingPrompts, id)
		ok = false
	}
	pendingPromptsMu.Unlock()

	if !ok {
		writeJSON(w, http.StatusOK, map[string]any{"resolved": false, "expired": true})
		return
	}

	if prompt.Resolved {
		writeJSON(w, http.StatusOK, map[string]any{"resolved": true, "choice": prompt.Response})
		// Clean up after delivery
		pendingPromptsMu.Lock()
		delete(pendingPrompts, id)
		pendingPromptsMu.Unlock()
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"resolved": false})
}
