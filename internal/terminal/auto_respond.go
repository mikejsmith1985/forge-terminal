// Package terminal provides auto-respond detection for Copilot CLI.
package terminal

import (
	"regexp"
	"strings"
	"sync"
	"time"
)

// AutoRespondState represents the current state of the conversation.
type AutoRespondState int

const (
	StateIdle AutoRespondState = iota
	StateUserTyping
	StateWaitingForAssistant
	StateAssistantResponding
)

// AutoRespondDetector detects when Copilot CLI is waiting for user input.
// This is INDEPENDENT of AM (Artificial Memory) system.
type AutoRespondDetector struct {
	mu                 sync.RWMutex
	enabled            bool
	state              AutoRespondState
	lastOutputTime     time.Time
	lastInputTime      time.Time
	outputBuffer       strings.Builder
	provider           string // "github-copilot", "claude", etc.
	promptPattern      *regexp.Regexp
	sessionStartTime   time.Time
	turnCount          int
	onWaitingForUser   func() // Callback when waiting for user input
	onAssistantActive  func() // Callback when assistant is responding
}

// NewAutoRespondDetector creates a new standalone auto-respond detector.
func NewAutoRespondDetector(provider string) *AutoRespondDetector {
	d := &AutoRespondDetector{
		enabled:          false,
		state:            StateIdle,
		provider:         provider,
		sessionStartTime: time.Now(),
	}
	d.updatePromptPattern()
	return d
}

// SetEnabled enables or disables auto-respond detection.
func (d *AutoRespondDetector) SetEnabled(enabled bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.enabled = enabled
	if enabled {
		d.state = StateIdle
		d.outputBuffer.Reset()
		d.sessionStartTime = time.Now()
		d.turnCount = 0
	}
}

// IsEnabled returns whether auto-respond is enabled.
func (d *AutoRespondDetector) IsEnabled() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.enabled
}

// SetCallbacks sets callbacks for state changes.
func (d *AutoRespondDetector) SetCallbacks(onWaitingForUser, onAssistantActive func()) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onWaitingForUser = onWaitingForUser
	d.onAssistantActive = onAssistantActive
}

// ProcessOutput processes output from the terminal and detects state changes.
func (d *AutoRespondDetector) ProcessOutput(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return
	}

	// Add to buffer (keep last 2KB only to prevent memory issues)
	if d.outputBuffer.Len() > 2048 {
		current := d.outputBuffer.String()
		d.outputBuffer.Reset()
		d.outputBuffer.WriteString(current[len(current)-1024:])
	}
	d.outputBuffer.Write(data)
	d.lastOutputTime = time.Now()

	// If we were idle and got output, assistant is responding
	if d.state == StateIdle || d.state == StateWaitingForAssistant {
		d.state = StateAssistantResponding
		if d.onAssistantActive != nil {
			go d.onAssistantActive()
		}
	}
}

// ProcessInput processes input from user.
func (d *AutoRespondDetector) ProcessInput(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return
	}

	d.lastInputTime = time.Now()

	// User typed - clear output buffer for fresh detection
	if d.state == StateIdle || d.state == StateAssistantResponding {
		d.state = StateUserTyping
		d.outputBuffer.Reset()
	}

	// If user pressed Enter, we're waiting for assistant
	dataStr := string(data)
	if strings.Contains(dataStr, "\r") || strings.Contains(dataStr, "\n") {
		d.state = StateWaitingForAssistant
		d.turnCount++
		d.outputBuffer.Reset()
	}
}

// Check should be called periodically to detect state changes.
// Returns true if the assistant is waiting for user input.
func (d *AutoRespondDetector) Check() bool {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return false
	}

	// Only check if assistant was responding
	if d.state != StateAssistantResponding {
		return false
	}

	timeSinceOutput := time.Since(d.lastOutputTime)
	output := d.outputBuffer.String()

	// Check for prompt reappearance (waiting for user)
	if d.detectPrompt(output) && timeSinceOutput > 500*time.Millisecond {
		d.state = StateIdle
		if d.onWaitingForUser != nil {
			go d.onWaitingForUser()
		}
		return true
	}

	// Timeout-based detection (no output for 3 seconds)
	if timeSinceOutput > 3*time.Second {
		d.state = StateIdle
		if d.onWaitingForUser != nil {
			go d.onWaitingForUser()
		}
		return true
	}

	return false
}

// detectPrompt checks if the output contains a prompt indicating waiting for input.
func (d *AutoRespondDetector) detectPrompt(output string) bool {
	// Remove ANSI codes for cleaner detection
	cleaned := stripANSI(output)
	
	// Get last few lines (where prompt would appear)
	lines := strings.Split(cleaned, "\n")
	if len(lines) == 0 {
		return false
	}

	// Check last 3 lines for prompt
	startIdx := len(lines) - 3
	if startIdx < 0 {
		startIdx = 0
	}
	lastLines := strings.Join(lines[startIdx:], "\n")

	// Provider-specific prompt detection
	switch d.provider {
	case "github-copilot":
		return d.detectCopilotPrompt(lastLines)
	case "claude":
		return d.detectClaudePrompt(lastLines)
	default:
		return d.detectGenericPrompt(lastLines)
	}
}

// detectCopilotPrompt detects GitHub Copilot CLI prompt.
func (d *AutoRespondDetector) detectCopilotPrompt(text string) bool {
	// Copilot CLI shows an empty input line when waiting
	// Look for characteristic patterns:
	// 1. Empty line at end (just cursor)
	// 2. Lack of streaming text indicators
	// 3. Cursor position at start of line

	trimmed := strings.TrimSpace(text)
	
	// Check if ends with blank line (just newline)
	if strings.HasSuffix(text, "\n\n") || strings.HasSuffix(text, "\n \n") {
		return true
	}

	// Check for cursor at line start with no text after
	if strings.HasSuffix(trimmed, ">") || strings.HasSuffix(trimmed, "❯") {
		return true
	}

	// Check if last line is empty or very short (< 3 chars)
	lines := strings.Split(text, "\n")
	if len(lines) > 0 {
		lastLine := strings.TrimSpace(lines[len(lines)-1])
		if len(lastLine) < 3 {
			return true
		}
	}

	return false
}

// detectClaudePrompt detects Claude CLI prompt.
func (d *AutoRespondDetector) detectClaudePrompt(text string) bool {
	return strings.HasSuffix(strings.TrimSpace(text), ">") ||
		strings.HasSuffix(strings.TrimSpace(text), "Claude >")
}

// detectGenericPrompt detects generic CLI prompts.
func (d *AutoRespondDetector) detectGenericPrompt(text string) bool {
	trimmed := strings.TrimSpace(text)
	return strings.HasSuffix(trimmed, ">") ||
		strings.HasSuffix(trimmed, "$") ||
		strings.HasSuffix(trimmed, "#")
}

// GetState returns the current state.
func (d *AutoRespondDetector) GetState() AutoRespondState {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.state
}

// GetStats returns statistics about the session.
func (d *AutoRespondDetector) GetStats() map[string]interface{} {
	d.mu.RLock()
	defer d.mu.RUnlock()

	return map[string]interface{}{
		"enabled":     d.enabled,
		"state":       d.state,
		"turnCount":   d.turnCount,
		"uptime":      time.Since(d.sessionStartTime).Seconds(),
		"provider":    d.provider,
		"bufferSize":  d.outputBuffer.Len(),
	}
}

// Reset clears all state.
func (d *AutoRespondDetector) Reset() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state = StateIdle
	d.outputBuffer.Reset()
	d.turnCount = 0
	d.sessionStartTime = time.Now()
}

// updatePromptPattern updates the regex pattern for prompt detection.
func (d *AutoRespondDetector) updatePromptPattern() {
	// Basic pattern - can be enhanced
	d.promptPattern = regexp.MustCompile(`[\n\r][\s]*[>$#❯]\s*$`)
}

// stripANSI removes ANSI escape sequences.
func stripANSI(text string) string {
	ansiPattern := regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)
	return ansiPattern.ReplaceAllString(text, "")
}
