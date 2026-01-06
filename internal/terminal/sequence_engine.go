// Package terminal provides action sequence engine for auto-respond.
package terminal

import (
	"bytes"
	"log"
	"regexp"
	"sync"
	"time"
)

// ActionType represents a single action type in a sequence.
type ActionType int

const (
	ActionKey   ActionType = iota // Send a key (TAB, ENTER, SPACE, etc.)
	ActionText                    // Send text string
	ActionSleep                   // Wait for duration
)

// Action represents a single step in an action sequence.
type Action struct {
	Type     ActionType
	Key      byte          // For ActionKey: the key code
	Text     string        // For ActionText: the string to send
	Duration time.Duration // For ActionSleep: how long to wait
}

// Sequence represents a series of actions triggered by a pattern.
type Sequence struct {
	Name       string         // Human-readable name for logging
	Pattern    *regexp.Regexp // Pattern that triggers this sequence
	Actions    []Action       // Actions to perform when triggered
	SettleTime time.Duration  // How long pattern must be stable before firing
}

// SequenceEngine manages pattern detection and action execution.
type SequenceEngine struct {
	mu             sync.Mutex
	enabled        bool
	sequences      []*Sequence
	writer         func([]byte) error // Callback to write to PTY
	settleBuffer   string             // Buffer for pattern matching
	settleTime     time.Time          // When the current pattern was first seen
	settledPattern *Sequence          // Pattern currently "settling"
	executing      bool               // Currently executing a sequence
	aborted        bool               // User input killed execution
	maxBufferSize  int                // Maximum settle buffer size
	shouldContinue func() bool        // Callback to check if execution should continue
}

// ExclusionPatterns - menus where we should NOT auto-respond
// These are user choice menus where the user needs to pick, not just confirm
var ExclusionPatterns = []*regexp.Regexp{
	// Model selection menus (Copilot /model command)
	regexp.MustCompile(`(?i)Select a model`),
	regexp.MustCompile(`(?i)Choose.*model`),
	// Model names in selection context
	regexp.MustCompile(`(?i)(gpt-4|gpt-3\.5|claude|o1-|o3-|gemini).*\n.*(gpt-4|gpt-3\.5|claude|o1-|o3-|gemini)`),
	// Generic selection menus (not confirmation)
	regexp.MustCompile(`(?i)Select an option`),
	regexp.MustCompile(`(?i)Choose an option`),
	regexp.MustCompile(`(?i)Pick.*:`),
	// Multiple numbered options with 3+ items (not just Yes/No)
	regexp.MustCompile(`(?s)\d+\.\s*\S+.*\n.*\d+\.\s*\S+.*\n.*\d+\.\s*\S+`),
}

// DefaultSequences contains pre-configured patterns for common CLI tools.
// NOTE: More specific patterns should come BEFORE generic ones!
var DefaultSequences = []*Sequence{
	// Copilot CLI: "[Y/n]" confirmation prompt
	{
		Name:       "copilot-confirm-yn",
		Pattern:    regexp.MustCompile(`\[Y/n\]\s*$`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: 'y'},
			{Type: ActionKey, Key: '\r'},
		},
	},
	// Copilot CLI: "[y/N]" confirmation (default No, we want Yes)
	{
		Name:       "copilot-confirm-yN",
		Pattern:    regexp.MustCompile(`\[y/N\]\s*$`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: 'y'},
			{Type: ActionKey, Key: '\r'},
		},
	},
	// Copilot CLI: "Do you want to add these directories to the allowed list?"
	// MUST come before copilot-menu-yes-selected since it also has "> 1. Yes"
	{
		Name:       "copilot-add-to-allowed-list",
		Pattern:    regexp.MustCompile(`(?i)Do you want to add.*to the allowed list\?`),
		SettleTime: 400 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Press Enter (Yes is default/selected)
		},
	},
	// Copilot CLI: Menu with "> 1. Yes" OR ">\n1. Yes" (cursor on separate line)
	{
		Name:       "copilot-menu-confirm-with-keys",
		Pattern:    regexp.MustCompile(`(?s)Confirm with number keys.*and Enter`),
		SettleTime: 400 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Press Enter to confirm selection
		},
	},
	// Copilot CLI: "Do you want to run this command?" with selection
	{
		Name:       "copilot-run-command",
		Pattern:    regexp.MustCompile(`Do you want to run this command\?`),
		SettleTime: 400 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Press Enter to confirm
		},
	},
	// Copilot CLI: Menu with "> 1. Yes" selected (GENERIC - put after specific patterns)
	{
		Name:       "copilot-menu-yes-selected",
		Pattern:    regexp.MustCompile(`(?m)^[>❯›]\s*1\.\s*Yes`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Just press Enter
		},
	},
	// Copilot CLI: Error message "Copilot couldn't generate a response"
	{
		Name:       "copilot-error-no-response",
		Pattern:    regexp.MustCompile(`(?i)Copilot couldn.*t generate a response`),
		SettleTime: 400 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Press Enter to dismiss
		},
	},
	// Claude Code: Tab navigation prompts
	{
		Name:       "claude-tab-navigate",
		Pattern:    regexp.MustCompile(`(?i)(Use.*↹.*Tab.*to\s+navigate|Press.*Tab.*to\s+switch|↹\s+to\s+navigate)`),
		SettleTime: 400 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\t'}, // Tab
			{Type: ActionSleep, Duration: 100 * time.Millisecond},
			{Type: ActionKey, Key: '\t'}, // Tab again
			{Type: ActionSleep, Duration: 100 * time.Millisecond},
			{Type: ActionKey, Key: '\r'}, // Enter
		},
	},
	// Claude Code: Yes/No with Yes highlighted
	{
		Name:       "claude-yes-no",
		Pattern:    regexp.MustCompile(`(?i)\[Yes\].*No|Yes.*\[No\]`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: '\r'}, // Press Enter (Yes is default)
		},
	},
	// npm: "Ok to proceed? (y)"
	{
		Name:       "npm-proceed",
		Pattern:    regexp.MustCompile(`Ok to proceed\?\s*\(y\)`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: 'y'},
			{Type: ActionKey, Key: '\r'},
		},
	},
	// npm/yarn: "? Are you sure" prompts
	{
		Name:       "npm-are-you-sure",
		Pattern:    regexp.MustCompile(`\?\s+Are you sure.*\(y/n\)`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: 'y'},
			{Type: ActionKey, Key: '\r'},
		},
	},
	// Generic: (yes/no) prompts
	{
		Name:       "generic-yes-no",
		Pattern:    regexp.MustCompile(`\(yes/no\)\s*[:\?]?\s*$`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionText, Text: "yes"},
			{Type: ActionKey, Key: '\r'},
		},
	},
	// PowerShell: [Y] Yes [A] Yes to All...
	{
		Name:       "powershell-confirm",
		Pattern:    regexp.MustCompile(`\[Y\]\s*Yes\s+\[A\]\s*Yes to All`),
		SettleTime: 300 * time.Millisecond,
		Actions: []Action{
			{Type: ActionKey, Key: 'Y'},
			{Type: ActionKey, Key: '\r'},
		},
	},
}

// NewSequenceEngine creates a new sequence engine with default patterns.
func NewSequenceEngine(writer func([]byte) error) *SequenceEngine {
	return &SequenceEngine{
		enabled:       false,
		sequences:     DefaultSequences,
		writer:        writer,
		settleBuffer:  "",
		maxBufferSize: 2048,
	}
}

// SetEnabled enables or disables the sequence engine.
func (se *SequenceEngine) SetEnabled(enabled bool) {
	se.mu.Lock()
	defer se.mu.Unlock()
	se.enabled = enabled
	if !enabled {
		se.reset()
	}
}

// IsEnabled returns whether the engine is enabled.
func (se *SequenceEngine) IsEnabled() bool {
	se.mu.Lock()
	defer se.mu.Unlock()
	return se.enabled
}

// ProcessOutput processes PTY output for pattern matching.
// This should be called with FILTERED output (after EchoBuffer.FilterEcho).
func (se *SequenceEngine) ProcessOutput(data []byte) {
	se.mu.Lock()
	defer se.mu.Unlock()

	if !se.enabled || se.executing {
		return
	}

	// Strip ANSI codes for pattern matching
	var cleanBuf bytes.Buffer
	stripANSIToBuffer(data, &cleanBuf)
	clean := cleanBuf.String()

	if len(clean) == 0 {
		return
	}

	// Append to settle buffer (keep bounded)
	se.settleBuffer += clean
	if len(se.settleBuffer) > se.maxBufferSize {
		se.settleBuffer = se.settleBuffer[len(se.settleBuffer)-se.maxBufferSize:]
	}

	// FIRST: Check exclusion patterns - if any match, do NOT auto-respond
	for _, excl := range ExclusionPatterns {
		if excl.MatchString(se.settleBuffer) {
			// Reset any pending pattern and don't match anything
			if se.settledPattern != nil {
				log.Printf("[AutoRespond] EXCLUDED - matches exclusion pattern, was settling '%s'",
					se.settledPattern.Name)
				se.settledPattern = nil
			}
			return
		}
	}

	// Check if any sequence pattern matches
	for _, seq := range se.sequences {
		if seq.Pattern.MatchString(se.settleBuffer) {
			if se.settledPattern == seq {
				// Same pattern - check if settle time elapsed
				if time.Since(se.settleTime) >= seq.SettleTime {
					log.Printf("[AutoRespond] Pattern '%s' settled for %v - executing sequence",
						seq.Name, seq.SettleTime)
					se.executeSequenceLocked(seq)
					return
				}
				// Still settling - wait for more time
			} else {
				// New pattern - start settle timer
				log.Printf("[AutoRespond] Pattern '%s' detected - waiting %v to settle",
					seq.Name, seq.SettleTime)
				se.settledPattern = seq
				se.settleTime = time.Now()
			}
			return
		}
	}

	// No match - reset settle state
	if se.settledPattern != nil {
		log.Printf("[AutoRespond] Pattern '%s' no longer matches - resetting",
			se.settledPattern.Name)
	}
	se.settledPattern = nil
}

// CheckSettle should be called periodically to check if settled patterns should fire.
func (se *SequenceEngine) CheckSettle() {
	se.mu.Lock()
	defer se.mu.Unlock()

	if !se.enabled || se.executing || se.settledPattern == nil {
		return
	}

	// Double-check exclusions before firing (buffer may have changed)
	for _, excl := range ExclusionPatterns {
		if excl.MatchString(se.settleBuffer) {
			log.Printf("[AutoRespond] Settle check: EXCLUDED - pattern '%s' aborted",
				se.settledPattern.Name)
			se.settledPattern = nil
			return
		}
	}

	if time.Since(se.settleTime) >= se.settledPattern.SettleTime {
		log.Printf("[AutoRespond] Settle check: Pattern '%s' ready - executing",
			se.settledPattern.Name)
		se.executeSequenceLocked(se.settledPattern)
	}
}

// executeSequenceLocked executes a sequence (must be called with lock held).
func (se *SequenceEngine) executeSequenceLocked(seq *Sequence) {
	se.executing = true
	se.aborted = false
	se.settledPattern = nil
	se.settleBuffer = ""

	// Execute in goroutine to not block the main loop
	go se.executeActions(seq)
}

// executeActions performs the sequence actions.
func (se *SequenceEngine) executeActions(seq *Sequence) {
	defer func() {
		se.mu.Lock()
		se.executing = false
		se.mu.Unlock()
	}()

	log.Printf("[AutoRespond] Executing sequence '%s' with %d actions",
		seq.Name, len(seq.Actions))

	for i, action := range seq.Actions {
		// Check for abort before each action
		se.mu.Lock()
		aborted := se.aborted
		shouldContinue := se.shouldContinue
		se.mu.Unlock()

		if aborted {
			log.Printf("[AutoRespond] Sequence '%s' aborted at action %d by user input",
				seq.Name, i)
			return
		}

		// PRODUCTION FIX: Check toggle state in real-time
		if shouldContinue != nil && !shouldContinue() {
			log.Printf("[AutoRespond] Sequence '%s' aborted at action %d by user toggle",
				seq.Name, i)
			return
		}

		switch action.Type {
		case ActionKey:
			if err := se.writer([]byte{action.Key}); err != nil {
				log.Printf("[AutoRespond] Failed to send key 0x%02X: %v",
					action.Key, err)
				return
			}
			log.Printf("[AutoRespond] Sent key: 0x%02X (%s)",
				action.Key, keyName(action.Key))

		case ActionText:
			if err := se.writer([]byte(action.Text)); err != nil {
				log.Printf("[AutoRespond] Failed to send text '%s': %v",
					action.Text, err)
				return
			}
			log.Printf("[AutoRespond] Sent text: '%s'", action.Text)

		case ActionSleep:
			log.Printf("[AutoRespond] Sleeping for %v", action.Duration)
			time.Sleep(action.Duration)
		}
	}

	log.Printf("[AutoRespond] Sequence '%s' completed successfully", seq.Name)
}

// AbortOnUserInput aborts any pending or executing sequence.
// Must be called when user types anything.
func (se *SequenceEngine) AbortOnUserInput() {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.settledPattern != nil || se.executing {
		log.Printf("[AutoRespond] User input detected - aborting sequence")
	}

	se.aborted = true
	se.settledPattern = nil
	se.settleBuffer = ""
}

// reset clears all state (must be called with lock held or when safe).
func (se *SequenceEngine) reset() {
	se.settleBuffer = ""
	se.settledPattern = nil
	se.executing = false
	se.aborted = false
}

// GetStats returns statistics about the engine state.
func (se *SequenceEngine) GetStats() map[string]interface{} {
	se.mu.Lock()
	defer se.mu.Unlock()

	settlingPattern := ""
	if se.settledPattern != nil {
		settlingPattern = se.settledPattern.Name
	}

	return map[string]interface{}{
		"enabled":         se.enabled,
		"executing":       se.executing,
		"bufferSize":      len(se.settleBuffer),
		"settlingPattern": settlingPattern,
		"sequenceCount":   len(se.sequences),
	}
}

// AddSequence adds a custom sequence pattern.
func (se *SequenceEngine) AddSequence(seq *Sequence) {
	se.mu.Lock()
	defer se.mu.Unlock()
	se.sequences = append(se.sequences, seq)
}

// keyName returns a human-readable name for a key byte.
func keyName(b byte) string {
	switch b {
	case '\r':
		return "ENTER"
	case '\n':
		return "NEWLINE"
	case '\t':
		return "TAB"
	case ' ':
		return "SPACE"
	case 0x7F:
		return "BACKSPACE"
	case 0x1B:
		return "ESC"
	default:
		if b >= 32 && b < 127 {
			return string(b)
		}
		return "CTRL"
	}
}

// ansiEscapeRegex matches ANSI escape sequences
var ansiEscapeRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)

// stripANSIToBuffer removes ANSI escape sequences from data and writes to buf
func stripANSIToBuffer(data []byte, buf *bytes.Buffer) {
	clean := ansiEscapeRegex.ReplaceAll(data, nil)
	buf.Write(clean)
}
