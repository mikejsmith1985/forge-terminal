// Package terminal provides auto-respond detection for Copilot CLI.
// This is the Precision Auto-Responder v2.0 with:
// - Echo Buffer: Filters user input echoes to avoid self-triggering
// - Sequence Engine: Supports Tab/Enter/Sleep action chains
// - Settle Time: Waits for pattern stability before firing
// - User Abort: Any user input immediately kills automation
package terminal

import (
	"bytes"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/am"
)

// AutoRespondState represents the current state of the conversation.
type AutoRespondState int

const (
	StateIdle AutoRespondState = iota
	StateUserTyping
	StateWaitingForAssistant
	StateAssistantResponding
)

// PrecisionAutoResponder is the v2.0 auto-responder with echo filtering
// and sequence engine support. It replaces the simple AutoRespondDetector.
type PrecisionAutoResponder struct {
	mu               sync.RWMutex
	enabled          bool
	state            AutoRespondState
	lastOutputTime   time.Time
	lastInputTime    time.Time
	provider         string
	sessionStartTime time.Time
	turnCount        int

	// v2.0 Components
	echoBuffer     *EchoBuffer     // Filters user echo from PTY output
	sequenceEngine *SequenceEngine // Executes action sequences

	// Callbacks
	onWaitingForUser  func()
	onAssistantActive func()
	ptyWriter         func([]byte) error // Write to PTY
}

// NewPrecisionAutoResponder creates a new precision auto-responder.
// ptyWriter is the callback to write bytes to the PTY.
func NewPrecisionAutoResponder(provider string, ptyWriter func([]byte) error) *PrecisionAutoResponder {
	p := &PrecisionAutoResponder{
		enabled:          false,
		state:            StateIdle,
		provider:         provider,
		sessionStartTime: time.Now(),
		echoBuffer:       NewEchoBuffer(),
		ptyWriter:        ptyWriter,
	}
	// Initialize sequence engine with PTY writer
	p.sequenceEngine = NewSequenceEngine(ptyWriter)

	// Set callback to check if auto-respond is still enabled
	p.sequenceEngine.shouldContinue = func() bool {
		p.mu.RLock()
		defer p.mu.RUnlock()
		return p.enabled
	}

	return p
}

// AutoRespondDetector is kept for backward compatibility.
// It wraps PrecisionAutoResponder for existing code.
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

	// v2.0: Optional precision responder (nil if not initialized)
	precision *PrecisionAutoResponder
}

// NewAutoRespondDetector creates a new standalone auto-respond detector.
// For backward compatibility - use NewPrecisionAutoResponder for v2.0 features.
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

// NewAutoRespondDetectorWithPTY creates a detector with v2.0 precision responder.
func NewAutoRespondDetectorWithPTY(provider string, ptyWriter func([]byte) error) *AutoRespondDetector {
	d := NewAutoRespondDetector(provider)
	d.precision = NewPrecisionAutoResponder(provider, ptyWriter)
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

	// v2.0: Also enable/disable precision responder
	if d.precision != nil {
		d.precision.SetEnabled(enabled)
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

	// v2.0: Also set on precision responder
	if d.precision != nil {
		d.precision.SetCallbacks(onWaitingForUser, onAssistantActive)
	}
}

// ProcessOutput processes output from the terminal and detects state changes.
// v2.0: Routes through EchoBuffer to filter user echoes.
func (d *AutoRespondDetector) ProcessOutput(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return
	}

	// v2.0: Use precision responder if available
	if d.precision != nil {
		d.precision.ProcessOutput(data)
		return
	}

	// Legacy path: direct processing
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
// v2.0: Signals abort to sequence engine and adds to echo buffer.
func (d *AutoRespondDetector) ProcessInput(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if !d.enabled {
		return
	}

	// v2.0: Use precision responder if available
	if d.precision != nil {
		d.precision.ProcessInput(data)
		return
	}

	// Legacy path
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

	// v2.0: Check settle state in sequence engine
	if d.precision != nil {
		d.precision.Check()
		return false // v2.0 handles responses internally
	}

	// Legacy path
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
	// Use parser_core StripANSI for consistent ANSI removal
	var cleanBuf bytes.Buffer
	am.StripANSIToBuffer([]byte(output), &cleanBuf)
	cleaned := cleanBuf.String()

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

// ============================================================================
// PrecisionAutoResponder v2.0 Methods
// ============================================================================

// SetEnabled enables or disables the precision auto-responder.
func (p *PrecisionAutoResponder) SetEnabled(enabled bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.enabled = enabled
	p.sequenceEngine.SetEnabled(enabled)
	if enabled {
		p.state = StateIdle
		p.echoBuffer.Clear()
		p.sessionStartTime = time.Now()
		p.turnCount = 0
		log.Printf("[PrecisionAutoResponder] Enabled with provider: %s", p.provider)
	} else {
		log.Printf("[PrecisionAutoResponder] Disabled")
	}
}

// IsEnabled returns whether the precision auto-responder is enabled.
func (p *PrecisionAutoResponder) IsEnabled() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.enabled
}

// SetCallbacks sets callbacks for state changes.
func (p *PrecisionAutoResponder) SetCallbacks(onWaitingForUser, onAssistantActive func()) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.onWaitingForUser = onWaitingForUser
	p.onAssistantActive = onAssistantActive
}

// ProcessOutput processes PTY output through the echo buffer and sequence engine.
// This is the main entry point for PTY -> AutoResponder data flow.
func (p *PrecisionAutoResponder) ProcessOutput(data []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.enabled {
		return
	}

	p.lastOutputTime = time.Now()

	// CRITICAL: Filter out echoed user input before pattern matching
	filteredData := p.echoBuffer.FilterEcho(data)

	// If we were idle and got non-echo output, assistant is responding
	if len(filteredData) > 0 {
		if p.state == StateIdle || p.state == StateWaitingForAssistant {
			p.state = StateAssistantResponding
			if p.onAssistantActive != nil {
				go p.onAssistantActive()
			}
		}

		// Feed filtered output to sequence engine for pattern matching
		p.sequenceEngine.ProcessOutput(filteredData)
	}
}

// ProcessInput processes user input - aborts sequences and adds to echo buffer.
// This is the main entry point for User -> PTY data flow.
// MUST be called AFTER successful PTY write.
func (p *PrecisionAutoResponder) ProcessInput(data []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.enabled {
		return
	}

	p.lastInputTime = time.Now()

	// CRITICAL: Abort any pending or executing sequences FIRST
	p.sequenceEngine.AbortOnUserInput()

	// Add to echo buffer so we can filter these bytes from PTY output
	p.echoBuffer.AddPending(data)

	// Update state
	if p.state == StateIdle || p.state == StateAssistantResponding {
		p.state = StateUserTyping
	}

	// If user pressed Enter, we're waiting for assistant
	for _, b := range data {
		if b == '\r' || b == '\n' {
			p.state = StateWaitingForAssistant
			p.turnCount++
			break
		}
	}
}

// Check should be called periodically to check for settled patterns.
func (p *PrecisionAutoResponder) Check() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.enabled {
		return
	}

	// Check if any pattern has settled and should fire
	p.sequenceEngine.CheckSettle()
}

// GetStats returns statistics about the precision responder.
func (p *PrecisionAutoResponder) GetStats() map[string]interface{} {
	p.mu.RLock()
	defer p.mu.RUnlock()

	seqStats := p.sequenceEngine.GetStats()

	return map[string]interface{}{
		"enabled":        p.enabled,
		"state":          p.state,
		"turnCount":      p.turnCount,
		"uptime":         time.Since(p.sessionStartTime).Seconds(),
		"provider":       p.provider,
		"echoBufferLen":  p.echoBuffer.Len(),
		"sequenceEngine": seqStats,
	}
}

// Reset clears all state.
func (p *PrecisionAutoResponder) Reset() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.state = StateIdle
	p.echoBuffer.Clear()
	p.turnCount = 0
	p.sessionStartTime = time.Now()
}
