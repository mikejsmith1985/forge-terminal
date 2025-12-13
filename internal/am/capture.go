// Package am provides conversation capture for LLM CLI sessions.
package am

import (
	"regexp"
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

// ANSI escape sequence pattern - comprehensive pattern for terminal escape codes
// Matches: CSI sequences, OSC sequences (including rgb colors), DCS, PM, APC, and single-char escapes
var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)

// CleanUserInput processes raw PTY input into clean user prompt text.
func CleanUserInput(raw string) string {
	// Step 1: Apply backspace logic
	result := applyBackspaces(raw)

	// Step 2: Remove ANSI escape sequences
	result = ansiPattern.ReplaceAllString(result, "")

	// Step 3: Remove control characters except newline/tab
	result = removeControlChars(result)

	// Step 4: Normalize whitespace
	result = normalizeWhitespace(result)

	// Step 5: Remove CLI prompt characters if at start
	result = strings.TrimLeft(result, "> ❯ ")

	return strings.TrimSpace(result)
}

// applyBackspaces processes backspace characters in input.
// Handles both DEL (0x7f) and BS (0x08) by deleting previous character.
func applyBackspaces(s string) string {
	var result []rune
	runes := []rune(s)
	
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if r == '\x7f' || r == '\x08' { // DEL or BS
			if len(result) > 0 {
				result = result[:len(result)-1]
			}
		} else {
			result = append(result, r)
		}
	}
	return string(result)
}

// removeControlChars removes control characters except newline and tab.
func removeControlChars(s string) string {
	var result strings.Builder
	for _, r := range s {
		if r >= 32 || r == '\n' || r == '\t' || r == '\r' {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// normalizeWhitespace collapses multiple spaces and trims.
func normalizeWhitespace(s string) string {
	// Replace multiple spaces with single space
	space := regexp.MustCompile(`[ \t]+`)
	s = space.ReplaceAllString(s, " ")

	// Replace multiple newlines with single
	newlines := regexp.MustCompile(`[\r\n]+`)
	s = newlines.ReplaceAllString(s, "\n")

	return strings.TrimSpace(s)
}

// --- Output Parsing Functions ---

// ParseAssistantOutput cleans assistant output and returns confidence score.
func ParseAssistantOutput(raw string, provider string) (string, float64) {
	// Step 1: Remove ANSI sequences
	cleaned := ansiPattern.ReplaceAllString(raw, "")

	// Step 2: Remove common TUI artifacts
	cleaned = removeTUIArtifacts(cleaned, provider)

	// Step 3: Remove control characters
	cleaned = removeControlChars(cleaned)

	// Step 4: Normalize whitespace
	cleaned = normalizeWhitespace(cleaned)

	// Calculate confidence based on how much was stripped
	confidence := calculateParseConfidence(raw, cleaned)

	return cleaned, confidence
}

// removeTUIArtifacts removes provider-specific TUI elements.
func removeTUIArtifacts(s string, provider string) string {
	// Common patterns to remove
	patterns := []string{
		`\[[\?0-9;]*[hlm]`,           // DEC private modes
		`\[\d+;\d+H`,                  // Cursor positioning
		`\[\d+[ABCD]`,                 // Cursor movement
		`\[[\d;]*m`,                   // SGR (colors)
		`\[\?2004[hl]`,                // Bracketed paste
		`\[\?25[hl]`,                  // Cursor visibility
		`\[\?1049[hl]`,                // Alternate screen
	}

	result := s
	for _, pattern := range patterns {
		re := regexp.MustCompile(pattern)
		result = re.ReplaceAllString(result, "")
	}

	// Provider-specific cleanup
	switch provider {
	case "github-copilot":
		// Remove Copilot TUI frames
		result = regexp.MustCompile(`Welcome to GitHub Copilot.*?mistakes\.`).ReplaceAllString(result, "")
		result = regexp.MustCompile(`●.*?\n`).ReplaceAllString(result, "") // Status lines
	case "claude":
		// Remove Claude TUI frames
		result = regexp.MustCompile(`Claude Code v[\d.]+`).ReplaceAllString(result, "")
		result = regexp.MustCompile(`Tips for getting started.*?\n`).ReplaceAllString(result, "")
	}

	return result
}

// calculateParseConfidence estimates parsing quality.
func calculateParseConfidence(raw, cleaned string) float64 {
	if len(raw) == 0 {
		return 0.0
	}

	// Ratio of content retained
	retentionRatio := float64(len(cleaned)) / float64(len(raw))

	// Check for remaining artifacts
	artifactPatterns := []string{
		`\[`,      // Unclosed escape
		`\x1b`,    // Raw escape char
		`\?\d+`,   // DEC mode remnants
	}

	artifactCount := 0
	for _, pattern := range artifactPatterns {
		re := regexp.MustCompile(pattern)
		artifactCount += len(re.FindAllString(cleaned, -1))
	}

	// Penalize for artifacts
	artifactPenalty := float64(artifactCount) * 0.05

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
