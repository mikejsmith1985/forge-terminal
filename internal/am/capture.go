// Package am provides conversation capture for LLM CLI sessions.
package am

import (
	"strings"
	"sync"
	"time"
)

// CaptureState represents the current state of conversation capture.
type CaptureState int

const (
	StateIdle CaptureState = iota
	StateUserTyping
	StateWaitingResponse
	StateAssistantResponding
)

// CaptureMetrics tracks capture performance for health monitoring.
type CaptureMetrics struct {
	InputBytesCaptured       int64     `json:"inputBytesCaptured"`
	InputTurnsDetected       int64     `json:"inputTurnsDetected"`
	InputParseFailures       int64     `json:"inputParseFailures"`
	OutputBytesCaptured      int64     `json:"outputBytesCaptured"`
	OutputTurnsDetected      int64     `json:"outputTurnsDetected"`
	OutputParseFailures      int64     `json:"outputParseFailures"`
	SnapshotsCaptured        int       `json:"snapshotsCaptured"`
	ConversationsActive      int       `json:"conversationsActive"`
	ConversationsComplete    int       `json:"conversationsComplete"`
	ConversationsCorrupted   int       `json:"conversationsCorrupted"`
	RecoverableConversations int       `json:"recoverableConversations"`
	LowConfidenceParses      int64     `json:"lowConfidenceParses"`
	LastCaptureTime          time.Time `json:"lastCaptureTime"`
	LastSuccessfulSave       time.Time `json:"lastSuccessfulSave"`
	AutoRespondSessions      int       `json:"autoRespondSessions"`
	AutoRespondTurnsCaptured int       `json:"autoRespondTurnsCaptured"`
	// Additional metrics expected by tests
	ConversationsStarted    int   `json:"conversationsStarted"`
	ConversationsValidated  int   `json:"conversationsValidated"`
	TotalEventsProcessed    int64 `json:"totalEventsProcessed"`
	UptimeSeconds           int64 `json:"uptimeSeconds"`
	LayersOperational       int   `json:"layersOperational"`
	LayersTotal             int   `json:"layersTotal"`
}

// ConversationCapture manages real-time capture of LLM conversations.
type ConversationCapture struct {
	mu              sync.Mutex
	tabID           string
	provider        string
	state           CaptureState
	autoRespond     bool
	inputBuffer     strings.Builder
	outputBuffer    strings.Builder
	lastInputTime   time.Time
	lastOutputTime  time.Time
	currentTurnRaw  string
	metrics         *CaptureMetrics
	onUserTurn      func(content string, raw string)
	onAssistantTurn func(content string, raw string, confidence float64)
	onLowConfidence func(raw string)
}

// NewConversationCapture creates a new capture instance for a tab.
func NewConversationCapture(tabID, provider string) *ConversationCapture {
	return &ConversationCapture{
		tabID:    tabID,
		provider: provider,
		state:    StateIdle,
		metrics:  &CaptureMetrics{},
	}
}

// SetAutoRespond updates the auto-respond flag.
func (c *ConversationCapture) SetAutoRespond(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.autoRespond = enabled
	if enabled {
		c.metrics.AutoRespondSessions++
	}
}

// IsAutoRespond returns whether auto-respond is enabled.
func (c *ConversationCapture) IsAutoRespond() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.autoRespond
}

// SetCallbacks sets the callback functions for turn completion.
func (c *ConversationCapture) SetCallbacks(
	onUserTurn func(content string, raw string),
	onAssistantTurn func(content string, raw string, confidence float64),
	onLowConfidence func(raw string),
) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onUserTurn = onUserTurn
	c.onAssistantTurn = onAssistantTurn
	c.onLowConfidence = onLowConfidence
}

// CaptureInput processes raw input from PTY.
func (c *ConversationCapture) CaptureInput(data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	dataStr := string(data)
	c.inputBuffer.WriteString(dataStr)
	c.lastInputTime = time.Now()
	c.metrics.InputBytesCaptured += int64(len(data))

	if c.state == StateIdle || c.state == StateAssistantResponding {
		c.state = StateUserTyping
	}

	// Detect Enter press (user submitted prompt)
	if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
		c.flushUserTurnLocked()
	}
}

// CaptureOutput processes raw output from PTY.
func (c *ConversationCapture) CaptureOutput(data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()

	dataStr := string(data)
	c.outputBuffer.WriteString(dataStr)
	c.lastOutputTime = time.Now()
	c.metrics.OutputBytesCaptured += int64(len(data))

	if c.state == StateWaitingResponse {
		c.state = StateAssistantResponding
	}
}

// CheckResponseEnd checks if assistant response has ended (call periodically).
func (c *ConversationCapture) CheckResponseEnd(timeout time.Duration) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.state != StateAssistantResponding {
		return false
	}

	output := c.outputBuffer.String()
	timeSinceOutput := time.Since(c.lastOutputTime)

	// Detect response end via timeout or prompt reappearance
	if timeSinceOutput > timeout || c.detectPromptReappeared(output) {
		c.flushAssistantTurnLocked()
		return true
	}

	return false
}

// flushUserTurnLocked processes accumulated user input (must hold lock).
func (c *ConversationCapture) flushUserTurnLocked() {
	raw := c.inputBuffer.String()
	c.inputBuffer.Reset()

	if raw == "" {
		return
	}

	cleaned := CleanUserInput(raw)
	if cleaned == "" {
		return
	}

	c.metrics.InputTurnsDetected++
	if c.autoRespond {
		c.metrics.AutoRespondTurnsCaptured++
	}

	c.state = StateWaitingResponse

	if c.onUserTurn != nil {
		c.onUserTurn(cleaned, raw)
	}
}

// flushAssistantTurnLocked processes accumulated assistant output (must hold lock).
func (c *ConversationCapture) flushAssistantTurnLocked() {
	raw := c.outputBuffer.String()
	c.outputBuffer.Reset()

	if raw == "" {
		return
	}

	cleaned, confidence := ParseAssistantOutput(raw, c.provider)

	c.metrics.OutputTurnsDetected++
	c.state = StateIdle

	// Low confidence handling
	if confidence < 0.8 {
		c.metrics.OutputParseFailures++
		if c.autoRespond && c.onLowConfidence != nil {
			// In auto-respond mode, fall back to raw and notify
			c.onLowConfidence(raw)
		}
	}

	if c.onAssistantTurn != nil {
		c.onAssistantTurn(cleaned, raw, confidence)
	}
}

// detectPromptReappeared checks if CLI prompt has reappeared (end of response).
func (c *ConversationCapture) detectPromptReappeared(output string) bool {
	// Provider-specific prompt patterns
	patterns := map[string][]string{
		"github-copilot": {
			"\n‌",      // Copilot prompt char
			"\n❯",      // Alternative prompt
			"~/",       // Directory prompt often at end
		},
		"claude": {
			"\n>",      // Claude prompt
			"Claude >", // Claude prompt with name
			"\n❯",      // Alternative
		},
		"aider": {
			"\n>",      // Aider prompt
			"aider>",   // Aider named prompt
		},
	}

	providerPatterns, ok := patterns[c.provider]
	if !ok {
		providerPatterns = patterns["github-copilot"] // Default
	}

	for _, pattern := range providerPatterns {
		if strings.HasSuffix(output, pattern) || strings.Contains(output[max(0, len(output)-100):], pattern) {
			return true
		}
	}

	return false
}

// GetMetrics returns current capture metrics.
func (c *ConversationCapture) GetMetrics() *CaptureMetrics {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Return a copy
	m := *c.metrics
	return &m
}

// GetState returns current capture state.
func (c *ConversationCapture) GetState() CaptureState {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

// Reset clears all buffers and resets state.
func (c *ConversationCapture) Reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.inputBuffer.Reset()
	c.outputBuffer.Reset()
	c.state = StateIdle
	c.currentTurnRaw = ""
}

// --- Input Cleaning Functions ---

// CleanUserInput processes raw PTY input into clean user prompt text.
// Uses state machine parser from parser_core.go instead of regex.
func CleanUserInput(raw string) string {
	// Step 1: Apply backspace logic
	result := string(ApplyBackspaces([]byte(raw)))

	// Step 2: Remove ANSI escape sequences (state machine)
	result = StripANSIString(result)

	// Step 3: Remove control characters (bytes < 32 except newline/tab)
	result = removeControlChars(result)

	// Step 4: Normalize whitespace (byte-level, no regex)
	result = NormalizeWhitespace(result)

	// Step 5: Remove CLI prompt characters if at start
	result = strings.TrimLeft(result, "> ❯ ")

	return strings.TrimSpace(result)
}

// applyBackspaces is deprecated - use ApplyBackspaces from parser_core.go
func applyBackspaces(s string) string {
	return string(ApplyBackspaces([]byte(s)))
}

// removeControlChars is now handled by StripANSIToBuffer in parser_core.go
func removeControlChars(s string) string {
	var result strings.Builder
	for _, r := range s {
		if r >= 32 || r == '\n' || r == '\t' || r == '\r' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// normalizeWhitespace uses byte-level normalization from parser_core.go
func normalizeWhitespace(s string) string {
	return NormalizeWhitespace(s)
}

// --- Output Parsing Functions ---

// ParseAssistantOutput cleans assistant output and returns confidence score.
// Uses state machine parser from parser_core.go instead of regex.
func ParseAssistantOutput(raw string, provider string) (string, float64) {
	// Step 1: Remove ANSI sequences (state machine)
	cleaned := StripANSIString(raw)

	// Step 2: Remove common TUI artifacts (byte-level scanning)
	cleaned = removeTUIArtifacts(cleaned, provider)

	// Step 3: Normalize whitespace
	cleaned = NormalizeWhitespace(cleaned)

	// Calculate confidence based on how much was stripped
	confidence := calculateParseConfidence(raw, cleaned)

	return cleaned, confidence
}

// removeTUIArtifacts removes provider-specific TUI elements.
// Uses byte-level scanning instead of regex for performance.
func removeTUIArtifacts(s string, provider string) string {
	// The main ANSI sequences are already stripped by StripANSIString.
	// This function handles remaining text-based artifacts.

	result := s

	// Provider-specific cleanup using string operations
	switch provider {
	case "github-copilot":
		// Remove Copilot welcome message
		result = removeSubstringBetween(result, "Welcome to GitHub Copilot", "mistakes.")
		// Remove status lines (lines starting with ●)
		result = removeLinesWithPrefix(result, "●")
	case "claude":
		// Remove Claude version header
		result = removeLineContaining(result, "Claude Code v")
		// Remove tips line
		result = removeLineContaining(result, "Tips for getting started")
	}

	return result
}

// removeSubstringBetween removes text between start and end markers (inclusive).
func removeSubstringBetween(s, start, end string) string {
	startIdx := strings.Index(s, start)
	if startIdx == -1 {
		return s
	}
	endIdx := strings.Index(s[startIdx:], end)
	if endIdx == -1 {
		return s
	}
	return s[:startIdx] + s[startIdx+endIdx+len(end):]
}

// removeLinesWithPrefix removes all lines starting with the given prefix.
func removeLinesWithPrefix(s, prefix string) string {
	lines := strings.Split(s, "\n")
	var result []string
	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), prefix) {
			result = append(result, line)
		}
	}
	return strings.Join(result, "\n")
}

// removeLineContaining removes lines containing the substring.
func removeLineContaining(s, substr string) string {
	lines := strings.Split(s, "\n")
	var result []string
	for _, line := range lines {
		if !strings.Contains(line, substr) {
			result = append(result, line)
		}
	}
	return strings.Join(result, "\n")
}

// calculateParseConfidence estimates parsing quality.
// Uses byte-level artifact detection instead of regex.
func calculateParseConfidence(raw, cleaned string) float64 {
	if len(raw) == 0 {
		return 0.0
	}

	// Ratio of content retained
	retentionRatio := float64(len(cleaned)) / float64(len(raw))

	// Check for remaining artifacts using ContainsANSIArtifacts from parser_core
	artifactPenalty := 0.0
	if ContainsANSIArtifacts(cleaned) {
		artifactPenalty = 0.2
	}

	// Additional check for orphaned brackets (common artifact)
	bracketCount := strings.Count(cleaned, "[")
	if bracketCount > 5 {
		artifactPenalty += float64(bracketCount) * 0.01
	}

	// Base confidence from retention (too low = stripped too much, too high = didn't clean)
	var baseConfidence float64
	if retentionRatio < 0.1 {
		baseConfidence = 0.5 // Stripped too aggressively
	} else if retentionRatio > 0.98 {
		baseConfidence = 0.85 // Almost no stripping needed - likely clean input
	} else if retentionRatio > 0.90 {
		baseConfidence = 0.9 // Minimal stripping - good
	} else {
		baseConfidence = 0.85 // Moderate stripping - acceptable
	}

	confidence := baseConfidence - artifactPenalty
	if confidence < 0 {
		confidence = 0
	}
	if confidence > 1 {
		confidence = 1
	}

	return confidence
}

// max returns the larger of two ints.
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
