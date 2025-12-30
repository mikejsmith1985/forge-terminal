// Package terminal provides prompt detection for PTY streams.
// Implements a layered detection strategy:
// 1. OSC 133 Shell Integration (gold standard, 100% accurate)
// 2. Alternate Buffer Detection (TUI mode)
// 3. Heuristic Analysis (fallback for non-integrated shells)
package terminal

import (
	"bytes"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"
)

// PromptState represents the current state of the terminal.
type PromptState int

const (
	PromptStateUnknown PromptState = iota
	PromptStatePrompting      // Shell is displaying prompt (OSC 133;A)
	PromptStateWaitingForInput // Prompt complete, waiting for user input (OSC 133;B)
	PromptStateExecuting       // Command is executing (OSC 133;C)
	PromptStateTUI            // In alternate buffer (vim, htop, etc.)
)

func (s PromptState) String() string {
	switch s {
	case PromptStatePrompting:
		return "prompting"
	case PromptStateWaitingForInput:
		return "waiting_for_input"
	case PromptStateExecuting:
		return "executing"
	case PromptStateTUI:
		return "tui"
	default:
		return "unknown"
	}
}

// PromptDetector detects prompt states in PTY output streams.
type PromptDetector struct {
	mu sync.RWMutex

	// State
	state           PromptState
	alternateBuffer bool
	heuristicMode   bool

	// Timing
	lastActivity    time.Time
	quiescenceDelay time.Duration

	// Response accumulation
	responseBuffer  strings.Builder
	capturingResponse bool
	
	// v3.7.1: Debounced response completion
	responseCompleteTimer *time.Timer
	pendingResponse       string
	
	// v3.7.1: Last detected prompt text for interactive prompts
	lastPromptText string

	// Callbacks
	onPromptDetected   func()
	onWaitingForInput  func(promptText string) // v3.7.1: Now includes prompt text
	onCommandComplete  func()
	onResponseComplete func(response string)
	onStateChange      func(old, new PromptState)

	// Pattern matchers
	osc133Pattern       *regexp.Regexp
	altBufferEnter      *regexp.Regexp
	altBufferExit       *regexp.Regexp
	interactivePrompt   *regexp.Regexp
}

// NewPromptDetector creates a new prompt detector with default settings.
func NewPromptDetector() *PromptDetector {
	return &PromptDetector{
		state:           PromptStateUnknown,
		quiescenceDelay: 100 * time.Millisecond,
		lastActivity:    time.Now(),
		
		// OSC 133 sequences: \x1b]133;X\x07 where X is A, B, C, or D
		osc133Pattern: regexp.MustCompile(`\x1b\]133;([ABCD])\x07`),
		
		// Alternate buffer: \x1b[?1049h (enter) and \x1b[?1049l (exit)
		// Also handle ?47 and ?1047 variants
		altBufferEnter: regexp.MustCompile(`\x1b\[\?(1049|1047|47)h`),
		altBufferExit:  regexp.MustCompile(`\x1b\[\?(1049|1047|47)l`),
		
		// Interactive prompts: [Y/n], (y/n), etc.
		interactivePrompt: regexp.MustCompile(`\[(Y/n|y/N|y/n)\]|\(y/n\)|\(Y/N\)|:\s*$|\?\s*$`),
	}
}

// ProcessOutput processes PTY output and updates state.
// This is the main entry point for the detector.
func (d *PromptDetector) ProcessOutput(data []byte) {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.lastActivity = time.Now()
	
	// v3.7.1: Cancel pending response timer on new activity
	// This prevents premature response completion during streaming output
	if d.responseCompleteTimer != nil && len(data) > 0 {
		d.responseCompleteTimer.Stop()
		d.responseCompleteTimer = nil
	}

	// Accumulate response if capturing OR in heuristic mode
	if d.capturingResponse || d.heuristicMode {
		// Filter out OSC sequences from response
		clean := d.osc133Pattern.ReplaceAll(data, nil)
		d.responseBuffer.Write(clean)
	}

	// Layer 1: Check for OSC 133 sequences (highest priority)
	if matches := d.osc133Pattern.FindAllSubmatch(data, -1); len(matches) > 0 {
		for _, match := range matches {
			if len(match) > 1 {
				d.handleOSC133(string(match[1]))
			}
		}
		// OSC 133 found - don't use heuristics
		return
	}

	// Layer 2: Check for alternate buffer transitions
	if d.altBufferEnter.Match(data) {
		d.enterAlternateBuffer()
		return
	}
	if d.altBufferExit.Match(data) {
		d.exitAlternateBuffer()
		return
	}

	// Layer 3: If in TUI mode, ignore prompt detection
	if d.alternateBuffer {
		return
	}

	// Heuristic mode processing happens in CheckQuiescence
}

// handleOSC133 handles OSC 133 shell integration sequences.
func (d *PromptDetector) handleOSC133(code string) {
	oldState := d.state
	
	switch code {
	case "A":
		// Prompt start - if we were executing, response is complete
		if oldState == PromptStateExecuting && d.onResponseComplete != nil {
			response := d.responseBuffer.String()
			d.responseBuffer.Reset()
			d.capturingResponse = false
			go d.onResponseComplete(response)
		}
		d.state = PromptStatePrompting
		log.Printf("[PromptDetector] OSC 133;A - Prompt start")
		
	case "B":
		// Prompt end, waiting for input
		d.state = PromptStateWaitingForInput
		log.Printf("[PromptDetector] OSC 133;B - Waiting for input")
		if d.onWaitingForInput != nil {
			go d.onWaitingForInput(d.lastPromptText) // v3.7.1: Pass last known prompt text
		}
		
	case "C":
		// Command output starts
		if d.state == PromptStateExecuting && d.onResponseComplete != nil {
			// New command starting, previous response complete
			response := d.responseBuffer.String()
			d.responseBuffer.Reset()
			go d.onResponseComplete(response)
		}
		d.state = PromptStateExecuting
		d.capturingResponse = true
		d.responseBuffer.Reset()
		log.Printf("[PromptDetector] OSC 133;C - Command executing")
		
	case "D":
		// Command output ends
		if d.onCommandComplete != nil {
			go d.onCommandComplete()
		}
		if d.capturingResponse && d.onResponseComplete != nil {
			response := d.responseBuffer.String()
			d.capturingResponse = false
			go d.onResponseComplete(response)
		}
		log.Printf("[PromptDetector] OSC 133;D - Command complete")
	}

	if d.state != oldState && d.onStateChange != nil {
		go d.onStateChange(oldState, d.state)
	}
}

// enterAlternateBuffer handles switching to alternate screen buffer (TUI mode).
func (d *PromptDetector) enterAlternateBuffer() {
	oldState := d.state
	d.alternateBuffer = true
	d.state = PromptStateTUI
	log.Printf("[PromptDetector] Entered alternate buffer (TUI mode)")
	
	if d.onStateChange != nil {
		go d.onStateChange(oldState, d.state)
	}
}

// exitAlternateBuffer handles returning to main buffer.
func (d *PromptDetector) exitAlternateBuffer() {
	d.alternateBuffer = false
	oldState := d.state
	d.state = PromptStateUnknown // Will be determined by next prompt
	log.Printf("[PromptDetector] Exited alternate buffer")
	
	if d.onStateChange != nil {
		go d.onStateChange(oldState, d.state)
	}
}

// CheckQuiescence checks if the stream has been quiet long enough to indicate a prompt.
// This should be called periodically (e.g., every 50ms) by the caller.
func (d *PromptDetector) CheckQuiescence() {
	d.mu.Lock()
	defer d.mu.Unlock()

	// Don't use heuristics if not enabled
	if !d.heuristicMode {
		return
	}

	// Don't detect prompts in TUI mode
	if d.alternateBuffer {
		return
	}

	// Check if enough time has passed since last activity
	elapsed := time.Since(d.lastActivity)
	if elapsed < d.quiescenceDelay {
		return
	}

	// Stream is quiet - analyze accumulated output
	d.analyzeForPrompt()
}

// analyzeForPrompt uses heuristics to detect if we're at a prompt.
func (d *PromptDetector) analyzeForPrompt() {
	// Get last line of response buffer
	content := d.responseBuffer.String()
	if content == "" {
		return
	}

	lines := strings.Split(content, "\n")
	lastLine := ""
	for i := len(lines) - 1; i >= 0; i-- {
		trimmed := strings.TrimSpace(lines[i])
		if trimmed != "" {
			lastLine = lines[i]
			break
		}
	}

	if lastLine == "" {
		return
	}

	// Check for interactive prompt patterns
	if d.interactivePrompt.MatchString(lastLine) {
		log.Printf("[PromptDetector] Heuristic: Interactive prompt detected: %s", truncateForLog(lastLine, 50))
		
		oldState := d.state
		d.state = PromptStateWaitingForInput
		d.lastPromptText = lastLine // v3.7.1: Store for callback
		
		if d.onWaitingForInput != nil {
			go d.onWaitingForInput(lastLine) // v3.7.1: Pass prompt text
		}
		if d.onPromptDetected != nil {
			go d.onPromptDetected()
		}
		if d.onStateChange != nil && oldState != d.state {
			go d.onStateChange(oldState, d.state)
		}
		return
	}

	// Check for shell prompt patterns (ends with $, #, >, etc.)
	shellPrompt := regexp.MustCompile(`[$#>%]\s*$`)
	if shellPrompt.MatchString(lastLine) {
		log.Printf("[PromptDetector] Heuristic: Shell prompt detected")
		
		oldState := d.state
		// v3.7.1: Use debounced response completion to avoid triggering too early
		// This handles cases where LLM CLIs output incrementally with prompts
		if (d.state == PromptStateExecuting || d.capturingResponse) && d.onResponseComplete != nil {
			response := d.responseBuffer.String()
			
			// Cancel any existing timer
			if d.responseCompleteTimer != nil {
				d.responseCompleteTimer.Stop()
			}
			
			// Store pending response and start debounce timer
			d.pendingResponse = response
			d.responseCompleteTimer = time.AfterFunc(500*time.Millisecond, func() {
				d.mu.Lock()
				defer d.mu.Unlock()
				
				// Only fire if we're still pending and no new activity
				if d.pendingResponse != "" && d.onResponseComplete != nil {
					log.Printf("[PromptDetector] Response complete (debounced): %d chars", len(d.pendingResponse))
					d.capturingResponse = false
					go d.onResponseComplete(d.pendingResponse)
					d.pendingResponse = ""
					d.responseBuffer.Reset()
				}
			})
		}
		
		d.state = PromptStateWaitingForInput
		
		if d.onPromptDetected != nil {
			go d.onPromptDetected()
		}
		if d.onStateChange != nil && oldState != d.state {
			go d.onStateChange(oldState, d.state)
		}
	}
}

// State returns the current prompt state.
func (d *PromptDetector) State() PromptState {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.state
}

// SetState sets the state (for testing).
func (d *PromptDetector) SetState(state PromptState) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.state = state
}

// IsAlternateBuffer returns whether we're in TUI mode.
func (d *PromptDetector) IsAlternateBuffer() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.alternateBuffer
}

// SetHeuristicMode enables/disables heuristic prompt detection.
func (d *PromptDetector) SetHeuristicMode(enabled bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.heuristicMode = enabled
}

// StartResponseCapture begins accumulating output as a response.
// Also sets state to Executing so heuristic detection knows to fire onResponseComplete.
func (d *PromptDetector) StartResponseCapture() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.capturingResponse = true
	d.state = PromptStateExecuting // Critical: Set state so shell prompt detection triggers onResponseComplete
	d.responseBuffer.Reset()
	log.Printf("[PromptDetector] StartResponseCapture: state set to Executing")
}

// StopResponseCapture stops accumulating and returns the response.
func (d *PromptDetector) StopResponseCapture() string {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.capturingResponse = false
	return d.responseBuffer.String()
}

// GetAccumulatedResponse returns the current response without stopping capture.
func (d *PromptDetector) GetAccumulatedResponse() string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.responseBuffer.String()
}

// ClearResponseBuffer clears the accumulated response.
func (d *PromptDetector) ClearResponseBuffer() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.responseBuffer.Reset()
}

// Callback setters

func (d *PromptDetector) OnPromptDetected(fn func()) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onPromptDetected = fn
}

// v3.7.1: Updated to include prompt text
func (d *PromptDetector) OnWaitingForInput(fn func(promptText string)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onWaitingForInput = fn
}

func (d *PromptDetector) OnCommandComplete(fn func()) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onCommandComplete = fn
}

func (d *PromptDetector) OnResponseComplete(fn func(response string)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onResponseComplete = fn
}

func (d *PromptDetector) OnStateChange(fn func(old, new PromptState)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onStateChange = fn
}

// SetQuiescenceDelay sets how long to wait for stream silence before heuristic detection.
func (d *PromptDetector) SetQuiescenceDelay(delay time.Duration) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.quiescenceDelay = delay
}

// LastActivityTime returns when the last output was received.
func (d *PromptDetector) LastActivityTime() time.Time {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.lastActivity
}

// StripOSC133 removes OSC 133 sequences from output for display.
func StripOSC133(data []byte) []byte {
	pattern := regexp.MustCompile(`\x1b\]133;[ABCD]\x07`)
	return pattern.ReplaceAll(data, nil)
}

// ContainsOSC133 checks if data contains any OSC 133 sequences.
func ContainsOSC133(data []byte) bool {
	return bytes.Contains(data, []byte("\x1b]133;"))
}
