// Package am provides LLM conversation logging.
package am

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// Memory limits to prevent unbounded growth
const (
	maxTurnsPerConversation     = 500
	maxSnapshotsPerConversation = 100
	maxConversationsInMemory    = 10
)

// ScreenSnapshot represents a captured TUI screen state.
type ScreenSnapshot struct {
	Timestamp        time.Time `json:"timestamp"`
	SequenceNumber   int       `json:"sequenceNumber"`
	RawContent       string    `json:"rawContent"`
	CleanedContent   string    `json:"cleanedContent"`
	DiffFromPrevious string    `json:"diffFromPrevious,omitempty"`
}

// ConversationTurn represents a single exchange in an LLM conversation.
type ConversationTurn struct {
	Role            string    `json:"role"`
	Content         string    `json:"content"`
	Timestamp       time.Time `json:"timestamp"`
	Provider        string    `json:"provider"`
	Raw             string    `json:"raw,omitempty"`             // Raw PTY data for debugging
	CaptureMethod   string    `json:"captureMethod,omitempty"`   // "pty_input", "pty_output", "tui_snapshot"
	ParseConfidence float64   `json:"parseConfidence,omitempty"` // 0.0-1.0 for output parsing
}

// ConversationRecovery holds recovery metadata for a conversation.
type ConversationRecovery struct {
	LastSavedTurn          int    `json:"lastSavedTurn"`
	InProgressTurn         *int   `json:"inProgressTurn,omitempty"`
	CanRestore             bool   `json:"canRestore"`
	SuggestedRestorePrompt string `json:"suggestedRestorePrompt,omitempty"`
}

// ConversationMetadata holds context about where the conversation happened.
type ConversationMetadata struct {
	WorkingDirectory string `json:"workingDirectory,omitempty"`
	GitBranch        string `json:"gitBranch,omitempty"`
	ShellType        string `json:"shellType,omitempty"`
}

// LLMConversation represents a complete LLM conversation session.
type LLMConversation struct {
	ConversationID  string                `json:"conversationId"`
	TabID           string                `json:"tabId"`
	Provider        string                `json:"provider"`
	CommandType     string                `json:"commandType"`
	StartTime       time.Time             `json:"startTime"`
	EndTime         time.Time             `json:"endTime,omitempty"`
	Turns           []ConversationTurn    `json:"turns"`
	Complete        bool                  `json:"complete"`
	AutoRespond     bool                  `json:"autoRespond"`
	Metadata        *ConversationMetadata `json:"metadata,omitempty"`
	Recovery        *ConversationRecovery `json:"recovery,omitempty"`
	TUICaptureMode  bool                  `json:"tuiCaptureMode,omitempty"`
	ScreenSnapshots []ScreenSnapshot      `json:"screenSnapshots,omitempty"`
	ProcessPID      int                   `json:"processPID,omitempty"`
}

// LLMLogger manages LLM conversation logging for a tab.
type LLMLogger struct {
	mu                sync.Mutex
	tabID             string
	conversations     map[string]*LLMConversation
	activeConvID      string
	outputBuffer      string
	inputBuffer       string
	lastOutputTime    time.Time
	lastInputTime     time.Time
	lastSnapshotTime  time.Time // NEW: Track when last snapshot was saved
	lastDiskLoadTime  time.Time // Track when we last loaded from disk
	amDir             string
	autoRespond       bool
	capture           *ConversationCapture
	onLowConfidence   func(raw string) // Callback for Vision notification
	tuiCaptureMode    bool
	currentScreen     strings.Builder
	lastScreen        string
	snapshotCount     int
	onProcessCallback func(pid int, provider string) // Callback when Layer 3 detects process
}

var (
	llmLoggers   = make(map[string]*LLMLogger)
	llmLoggersMu sync.RWMutex

	// pendingAsyncWrites tracks async disk writes for test synchronization
	pendingAsyncWrites sync.WaitGroup
)

// WaitForPendingWrites waits for all async writes to complete (for testing)
func WaitForPendingWrites() {
	pendingAsyncWrites.Wait()
}

// GetLLMLogger returns or creates an LLM logger for a tab.
func GetLLMLogger(tabID string, amDir string) *LLMLogger {
	llmLoggersMu.Lock()
	defer llmLoggersMu.Unlock()

	log.Printf("[LLM Logger] GetLLMLogger called for tab '%s'", tabID)
	log.Printf("[LLM Logger] Global logger map size: %d", len(llmLoggers))

	if logger, exists := llmLoggers[tabID]; exists {
		log.Printf("[LLM Logger] ✓ Found existing logger for tab %s (conversations=%d)", tabID, len(logger.conversations))
		return logger
	}

	log.Printf("[LLM Logger] Creating NEW logger for tab %s", tabID)
	logger := &LLMLogger{
		tabID:         tabID,
		conversations: make(map[string]*LLMConversation),
		amDir:         amDir,
	}

	// Load existing conversations from disk
	logger.loadConversationsFromDisk()

	llmLoggers[tabID] = logger
	log.Printf("[LLM Logger] ✓ Logger created and registered for tab %s", tabID)
	log.Printf("[LLM Logger] Global logger map size now: %d", len(llmLoggers))
	return logger
}

// RemoveLLMLogger removes a logger when tab closes.
func RemoveLLMLogger(tabID string) {
	llmLoggersMu.Lock()
	defer llmLoggersMu.Unlock()
	delete(llmLoggers, tabID)
}

// SetAutoRespond updates the auto-respond flag for the logger.
func (l *LLMLogger) SetAutoRespond(enabled bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.autoRespond = enabled
	log.Printf("[LLM Logger] Auto-respond set to %v for tab %s", enabled, l.tabID)
}

// IsAutoRespond returns whether auto-respond is enabled.
func (l *LLMLogger) IsAutoRespond() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.autoRespond
}

// SetLowConfidenceCallback sets the callback for low-confidence parsing alerts.
// This is used to notify the user via Forge Vision when parsing quality is poor.
func (l *LLMLogger) SetLowConfidenceCallback(callback func(raw string)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.onLowConfidence = callback
}

// EnableTUICapture enables or disables TUI screen capture mode.
// When enabled, full screen snapshots are saved instead of line-by-line parsing.
func (l *LLMLogger) EnableTUICapture(enabled bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.tuiCaptureMode = enabled
	if enabled {
		log.Printf("[LLM Logger] TUI capture mode ENABLED for tab %s", l.tabID)
	} else {
		log.Printf("[LLM Logger] TUI capture mode DISABLED for tab %s", l.tabID)
	}
}

// IsTUICaptureMode returns whether TUI capture is enabled.
func (l *LLMLogger) IsTUICaptureMode() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.tuiCaptureMode
}

// StartConversationFromProcess starts a conversation triggered by Layer 3 process detection.
// This bridges Layer 3 (process monitoring) with Layer 1 (PTY logging).
func (l *LLMLogger) StartConversationFromProcess(provider string, cmdType string, pid int) string {
	l.mu.Lock()
	defer l.mu.Unlock()

	log.Printf("[LLM Logger] ═══ START CONVERSATION FROM PROCESS ═══")
	log.Printf("[LLM Logger] TabID: %s, Provider: %s, Type: %s, PID: %d", l.tabID, provider, cmdType, pid)

	convID := fmt.Sprintf("conv-%d", time.Now().UnixNano())
	log.Printf("[LLM Logger] Generated conversation ID: '%s'", convID)

	conv := &LLMConversation{
		ConversationID:  convID,
		TabID:           l.tabID,
		Provider:        provider,
		CommandType:     cmdType,
		StartTime:       time.Now(),
		Turns:           []ConversationTurn{},
		Complete:        false,
		TUICaptureMode:  true,
		ProcessPID:      pid,
		ScreenSnapshots: []ScreenSnapshot{},
		Metadata:        l.captureMetadata(),
	}

	// Add initial turn noting process start
	conv.Turns = append(conv.Turns, ConversationTurn{
		Role:          "system",
		Content:       fmt.Sprintf("LLM process started: %s (PID %d)", provider, pid),
		Timestamp:     time.Now(),
		Provider:      provider,
		CaptureMethod: "process_detection",
	})

	l.conversations[convID] = conv
	l.activeConvID = convID
	l.tuiCaptureMode = true
	l.snapshotCount = 0
	l.currentScreen.Reset()
	l.lastScreen = ""

	l.saveConversation(conv)

	EventBus.Publish(&LayerEvent{
		Type:      "LLM_START",
		Layer:     1,
		TabID:     l.tabID,
		ConvID:    convID,
		Provider:  provider,
		Timestamp: time.Now(),
		Metadata: map[string]interface{}{
			"pid":            pid,
			"tuiCaptureMode": true,
		},
	})

	log.Printf("[LLM Logger] ✅ CONVERSATION STARTED FROM PROCESS")
	log.Printf("[LLM Logger] ConvID: %s, TUI Mode: true", convID)
	log.Printf("[LLM Logger] ═══ END START CONVERSATION FROM PROCESS ═══")
	return convID
}

// StartConversation initiates a new LLM conversation.
func (l *LLMLogger) StartConversation(detected *llm.DetectedCommand) string {
	l.mu.Lock()
	defer l.mu.Unlock()

	log.Printf("[LLM Logger] ═══ START CONVERSATION ═══")
	log.Printf("[LLM Logger] TabID: %s", l.tabID)
	log.Printf("[LLM Logger] Provider: %s, Type: %s", detected.Provider, detected.Type)
	log.Printf("[LLM Logger] RawInput: '%s'", detected.RawInput)
	log.Printf("[LLM Logger] Prompt: '%s'", detected.Prompt)
	log.Printf("[LLM Logger] Current conversation map size: %d", len(l.conversations))
	log.Printf("[LLM Logger] Current active conversation: '%s'", l.activeConvID)

	convID := fmt.Sprintf("conv-%d", time.Now().UnixNano())
	log.Printf("[LLM Logger] Generated new conversation ID: '%s'", convID)

	conv := &LLMConversation{
		ConversationID: convID,
		TabID:          l.tabID,
		Provider:       string(detected.Provider),
		CommandType:    string(detected.Type),
		StartTime:      time.Now(),
		Turns:          []ConversationTurn{},
		Complete:       false,
		Metadata:       l.captureMetadata(),
	}
	log.Printf("[LLM Logger] Created conversation struct")

	if detected.Prompt != "" {
		log.Printf("[LLM Logger] Adding initial user turn with prompt: '%s'", detected.Prompt)
		conv.Turns = append(conv.Turns, ConversationTurn{
			Role:      "user",
			Content:   detected.Prompt,
			Timestamp: time.Now(),
			Provider:  string(detected.Provider),
		})
		log.Printf("[LLM Logger] Initial turn added, total turns: %d", len(conv.Turns))
	} else {
		log.Printf("[LLM Logger] No initial prompt provided")
	}

	log.Printf("[LLM Logger] Adding conversation to map with key '%s'", convID)
	l.conversations[convID] = conv
	log.Printf("[LLM Logger] ✓ Conversation added to map, new size: %d", len(l.conversations))

	log.Printf("[LLM Logger] Setting active conversation ID to '%s'", convID)
	l.activeConvID = convID
	log.Printf("[LLM Logger] ✓ Active conversation set")

	l.outputBuffer = ""
	l.lastOutputTime = time.Now()
	log.Printf("[LLM Logger] Output buffer reset")

	log.Printf("[LLM Logger] Saving conversation to disk...")
	l.saveConversation(conv)
	log.Printf("[LLM Logger] ✓ Conversation saved")

	log.Printf("[LLM Logger] Publishing LLM_START event...")
	EventBus.Publish(&LayerEvent{
		Type:      "LLM_START",
		Layer:     1,
		TabID:     l.tabID,
		ConvID:    convID,
		Provider:  string(detected.Provider),
		Timestamp: time.Now(),
	})
	log.Printf("[LLM Logger] ✓ Event published")

	log.Printf("[LLM Logger] ✅ CONVERSATION STARTED SUCCESSFULLY")
	log.Printf("[LLM Logger] Final state: activeConvID='%s', mapSize=%d", l.activeConvID, len(l.conversations))
	log.Printf("[LLM Logger] ═══ END START CONVERSATION ═══")
	return convID
}

// AddOutput accumulates LLM output.
func (l *LLMLogger) AddOutput(rawOutput string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.activeConvID == "" {
		return
	}

	// CRITICAL: Detect if shell prompt returned (LLM TUI exited)
	// This ends the conversation to prevent unbounded growth
	if l.detectShellPromptReturn(rawOutput) {
		log.Printf("[LLM Logger] 🛑 Shell prompt detected - ending conversation %s", l.activeConvID)
		l.endConversationLocked()
		return
	}

	// TUI Capture Mode: Accumulate to screen buffer and trigger snapshots
	if l.tuiCaptureMode {
		l.currentScreen.WriteString(rawOutput)
		l.lastOutputTime = time.Now()

		// Trigger snapshot on screen clear (event-based trigger)
		if l.detectScreenClear(rawOutput) {
			log.Printf("[LLM Logger] 📸 Screen clear detected! Saving snapshot (bufferSize=%d)", l.currentScreen.Len())
			l.saveScreenSnapshotLocked()
			return
		}

		return
	}

	// Traditional line-based capture
	l.outputBuffer += rawOutput
	l.lastOutputTime = time.Now()
}

// detectScreenClear checks if output contains screen clear sequences.
func (l *LLMLogger) detectScreenClear(output string) bool {
	// Screen clear: ESC[2J (clear screen) or ESC[H (home cursor)
	return strings.Contains(output, "\x1b[2J") ||
		strings.Contains(output, "\x1b[H") ||
		strings.Contains(output, "\x1b[3J") // Clear scrollback
}

// detectShellPromptReturn checks if output contains a shell prompt,
// indicating the LLM TUI has exited and we're back at the shell.
func (l *LLMLogger) detectShellPromptReturn(output string) bool {
	// Strip ANSI codes for pattern matching
	clean := l.stripANSI(output)

	// Common shell prompt patterns that indicate TUI exited:
	// PowerShell: "PS C:\...>" or "PS /home/...>"
	// CMD: "C:\...>"
	// Bash: "user@host:~$" or "$ " at end of line
	// WSL: "user@host:/mnt/c/..."

	patterns := []string{
		"PS ", // PowerShell prompt prefix
		">",   // Common prompt suffix (but need context)
		"$ ",  // Bash prompt
		"# ",  // Root prompt
	}

	// Check if output ends with a prompt-like pattern
	lines := strings.Split(clean, "\n")
	if len(lines) == 0 {
		return false
	}

	lastLine := strings.TrimSpace(lines[len(lines)-1])
	if lastLine == "" && len(lines) > 1 {
		lastLine = strings.TrimSpace(lines[len(lines)-2])
	}

	// PowerShell prompt: "PS C:\Users\foo>" or "PS /home/user>"
	if strings.HasPrefix(lastLine, "PS ") && strings.HasSuffix(lastLine, ">") {
		return true
	}

	// CMD prompt: "C:\Users\foo>" (letter followed by colon)
	if len(lastLine) > 3 && lastLine[1] == ':' && strings.HasSuffix(lastLine, ">") {
		return true
	}

	// Bash prompt: ends with "$ " or "# "
	if strings.HasSuffix(lastLine, "$ ") || strings.HasSuffix(lastLine, "# ") {
		return true
	}

	// User@host:path$ pattern
	if strings.Contains(lastLine, "@") && (strings.HasSuffix(lastLine, "$") || strings.HasSuffix(lastLine, "#")) {
		return true
	}

	_ = patterns // Suppress unused warning
	return false
}

// endConversationLocked ends the active conversation.
// Must be called with lock held.
func (l *LLMLogger) endConversationLocked() {
	if l.activeConvID == "" {
		return
	}

	conv, exists := l.conversations[l.activeConvID]
	if !exists {
		l.activeConvID = ""
		return
	}

	// TUI Mode: Save final screen snapshot and parse turns
	if l.tuiCaptureMode && l.currentScreen.Len() > 0 {
		l.saveScreenSnapshotLocked()
	}

	conv.Complete = true
	conv.EndTime = time.Now()
	l.saveConversation(conv)

	EventBus.Publish(&LayerEvent{
		Type:      "LLM_END",
		Layer:     1,
		TabID:     l.tabID,
		ConvID:    l.activeConvID,
		Timestamp: time.Now(),
		Metadata: map[string]interface{}{
			"tuiMode":   l.tuiCaptureMode,
			"snapshots": len(conv.ScreenSnapshots),
			"turns":     len(conv.Turns),
			"autoEnded": true,
		},
	})

	log.Printf("[LLM Logger] Ended conversation %s (TUI:%v, snapshots:%d, turns:%d)",
		l.activeConvID, l.tuiCaptureMode, len(conv.ScreenSnapshots), len(conv.Turns))

	l.activeConvID = ""
	l.tuiCaptureMode = false
	l.currentScreen.Reset()
	l.lastScreen = ""
	l.snapshotCount = 0
}

// saveScreenSnapshotLocked saves the current screen buffer as a snapshot.
// Must be called with lock held.
func (l *LLMLogger) saveScreenSnapshotLocked() {
	conv, exists := l.conversations[l.activeConvID]
	if !exists {
		return
	}

	rawContent := l.currentScreen.String()
	if rawContent == "" {
		return
	}

	// MEMORY LIMIT: Cap snapshots to prevent unbounded growth
	if len(conv.ScreenSnapshots) >= maxSnapshotsPerConversation {
		// Remove oldest snapshots, keep recent ones
		conv.ScreenSnapshots = conv.ScreenSnapshots[len(conv.ScreenSnapshots)-maxSnapshotsPerConversation+10:]
		log.Printf("[LLM Logger] ⚠️ Snapshot limit reached, trimmed old snapshots")
	}

	// Clean ANSI sequences for display
	cleanedContent := l.stripANSI(rawContent)

	// Calculate diff from previous snapshot
	diff := l.calculateDiff(l.lastScreen, cleanedContent)

	snapshot := ScreenSnapshot{
		Timestamp:        time.Now(),
		SequenceNumber:   l.snapshotCount,
		RawContent:       rawContent,
		CleanedContent:   cleanedContent,
		DiffFromPrevious: diff,
	}

	conv.ScreenSnapshots = append(conv.ScreenSnapshots, snapshot)
	l.snapshotCount++
	l.lastScreen = cleanedContent
	l.lastSnapshotTime = time.Now() // NEW: Track snapshot time
	l.currentScreen.Reset()

	log.Printf("[LLM Logger] 📸 Snapshot #%d saved for %s (%d chars, %d total snapshots)",
		l.snapshotCount, l.activeConvID, len(cleanedContent), len(conv.ScreenSnapshots))

	// NEW: Parse snapshots incrementally to extract assistant responses
	l.parseLatestSnapshotToTurns(conv, snapshot)

	// Save to disk ASYNC - don't block on disk I/O while holding mutex
	// Make a DEEP copy to avoid race conditions with slice modifications
	convCopy := LLMConversation{
		ConversationID:  conv.ConversationID,
		TabID:           conv.TabID,
		Provider:        conv.Provider,
		CommandType:     conv.CommandType,
		StartTime:       conv.StartTime,
		EndTime:         conv.EndTime,
		Complete:        conv.Complete,
		AutoRespond:     conv.AutoRespond,
		TUICaptureMode:  conv.TUICaptureMode,
		ProcessPID:      conv.ProcessPID,
		Metadata:        conv.Metadata,
		Recovery:        conv.Recovery,
		Turns:           append([]ConversationTurn(nil), conv.Turns...),
		ScreenSnapshots: append([]ScreenSnapshot(nil), conv.ScreenSnapshots...),
	}

	pendingAsyncWrites.Add(1)
	go func() {
		defer pendingAsyncWrites.Done()
		l.saveConversationAsync(&convCopy)
	}()
}

// stripANSI removes ANSI escape sequences from text.
func (l *LLMLogger) stripANSI(text string) string {
	// Pattern matches ANSI CSI sequences, OSC sequences, etc.
	re := strings.NewReplacer(
		"\x1b[2J", "",
		"\x1b[H", "",
		"\x1b[3J", "",
	)
	cleaned := re.Replace(text)
	// Remove remaining ANSI sequences
	for _, seq := range []string{"\x1b[", "\x1b]", "\x1b"} {
		if strings.Contains(cleaned, seq) {
			// Simplified removal - just keep printable chars
			var result strings.Builder
			inEscape := false
			for _, r := range cleaned {
				if r == '\x1b' {
					inEscape = true
				} else if inEscape && (r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z') {
					inEscape = false
				} else if !inEscape && (r >= 32 || r == '\n' || r == '\t' || r == '\r') {
					result.WriteRune(r)
				}
			}
			return result.String()
		}
	}
	return cleaned
}

// calculateDiff computes a simple diff between two screens.
func (l *LLMLogger) calculateDiff(oldScreen, newScreen string) string {
	if oldScreen == "" {
		return "Initial screen"
	}

	// Simple line-based diff
	oldLines := strings.Split(oldScreen, "\n")
	newLines := strings.Split(newScreen, "\n")

	var diff strings.Builder
	diff.WriteString(fmt.Sprintf("Changed %d → %d lines\n", len(oldLines), len(newLines)))

	// Find new content (simple append detection)
	if len(newLines) > len(oldLines) {
		diff.WriteString("New content:\n")
		for i := len(oldLines); i < len(newLines) && i < len(oldLines)+5; i++ {
			if newLines[i] != "" {
				diff.WriteString("+ ")
				diff.WriteString(newLines[i])
				diff.WriteString("\n")
			}
		}
	}

	return diff.String()
}

// parseLatestSnapshotToTurns attempts to extract assistant responses from the latest snapshot.
// This enables real-time turn detection rather than waiting until conversation ends.
// Must be called with lock held.
func (l *LLMLogger) parseLatestSnapshotToTurns(conv *LLMConversation, snapshot ScreenSnapshot) {
	// Only parse if we have previous snapshots to compare against
	if len(conv.ScreenSnapshots) < 2 {
		return
	}

	// Try to detect if this snapshot contains an assistant response
	// by looking for content that wasn't in the previous snapshot
	content := snapshot.CleanedContent

	// Provider-specific assistant response detection
	var response string
	switch conv.Provider {
	case "github-copilot":
		response = l.extractCopilotResponseFromSnapshot(content)
	case "claude":
		response = l.extractClaudeResponseFromSnapshot(content)
	case "aider":
		response = l.extractAiderResponseFromSnapshot(content)
	default:
		response = l.extractGenericResponseFromSnapshot(content)
	}

	// If we found a response and it's not a duplicate of the last turn
	if response != "" && len(response) > 20 {
		// Check if this is a duplicate of the last turn
		if len(conv.Turns) > 0 {
			lastTurn := conv.Turns[len(conv.Turns)-1]
			if lastTurn.Role == "assistant" && strings.Contains(lastTurn.Content, response[:min(50, len(response))]) {
				// Duplicate, skip
				return
			}
		}

		// Add assistant turn
		conv.Turns = append(conv.Turns, ConversationTurn{
			Role:            "assistant",
			Content:         response,
			Timestamp:       snapshot.Timestamp,
			Provider:        conv.Provider,
			CaptureMethod:   "tui_snapshot",
			ParseConfidence: 0.75,
		})

		log.Printf("[LLM Logger] ✨ Extracted assistant response from snapshot #%d (%d chars)",
			snapshot.SequenceNumber, len(response))
	}
}

// min returns the minimum of two integers.
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// extractCopilotResponseFromSnapshot extracts assistant response from Copilot TUI screen.
func (l *LLMLogger) extractCopilotResponseFromSnapshot(content string) string {
	lines := strings.Split(content, "\n")
	var response strings.Builder
	inResponse := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip empty lines and UI chrome
		if len(trimmed) == 0 ||
			strings.Contains(trimmed, "────") ||
			strings.Contains(trimmed, "Ctrl+") ||
			strings.Contains(trimmed, "Welcome to GitHub Copilot") ||
			strings.Contains(trimmed, "Enter @ to mention") {
			continue
		}

		// Skip the user prompt line
		if strings.HasPrefix(trimmed, ">") && len(trimmed) < 100 {
			inResponse = false
			continue
		}

		// Skip status lines
		if strings.Contains(trimmed, "gpt-") || strings.Contains(trimmed, "claude-") {
			continue
		}

		// Collect substantial content lines (likely assistant response)
		if len(trimmed) > 30 {
			if inResponse && response.Len() > 0 {
				response.WriteString("\n")
			}
			response.WriteString(trimmed)
			inResponse = true
		}
	}

	return strings.TrimSpace(response.String())
}

// extractClaudeResponseFromSnapshot extracts assistant response from Claude TUI screen.
func (l *LLMLogger) extractClaudeResponseFromSnapshot(content string) string {
	lines := strings.Split(content, "\n")
	var response strings.Builder

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip UI elements
		if len(trimmed) == 0 ||
			strings.Contains(trimmed, "Claude") ||
			strings.HasPrefix(trimmed, ">") {
			continue
		}

		// Collect content
		if len(trimmed) > 20 {
			if response.Len() > 0 {
				response.WriteString("\n")
			}
			response.WriteString(trimmed)
		}
	}

	return strings.TrimSpace(response.String())
}

// extractAiderResponseFromSnapshot extracts assistant response from Aider output.
func (l *LLMLogger) extractAiderResponseFromSnapshot(content string) string {
	lines := strings.Split(content, "\n")
	var response strings.Builder

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip prompts
		if strings.HasPrefix(trimmed, ">") || len(trimmed) == 0 {
			continue
		}

		// Collect responses
		if len(trimmed) > 15 {
			if response.Len() > 0 {
				response.WriteString("\n")
			}
			response.WriteString(trimmed)
		}
	}

	return strings.TrimSpace(response.String())
}

// extractGenericResponseFromSnapshot attempts generic response extraction.
func (l *LLMLogger) extractGenericResponseFromSnapshot(content string) string {
	lines := strings.Split(content, "\n")
	var response strings.Builder

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Collect any substantial content
		if len(trimmed) > 25 && !strings.HasPrefix(trimmed, ">") {
			if response.Len() > 0 {
				response.WriteString("\n")
			}
			response.WriteString(trimmed)
		}
	}

	return strings.TrimSpace(response.String())
}

// AddUserInput captures user input during an active LLM conversation.
// This is the key method that was missing - it captures what the user types
// AFTER the LLM session has started (e.g., prompts inside copilot TUI).
func (l *LLMLogger) AddUserInput(rawInput string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.activeConvID == "" {
		return
	}

	l.inputBuffer += rawInput
	l.lastInputTime = time.Now()

	// Only trigger snapshot on Enter press (user submitted prompt), not every keystroke
	// This prevents blocking disk I/O on every keystroke which caused 30-second keyboard lag
	if strings.Contains(rawInput, "\r") || strings.Contains(rawInput, "\n") {
		// Save snapshot ONLY on Enter press in TUI mode
		if l.tuiCaptureMode && l.currentScreen.Len() > 0 {
			log.Printf("[LLM Logger] 📸 Post-enter snapshot trigger (bufferSize=%d)", l.currentScreen.Len())
			l.saveScreenSnapshotLocked()
		}
		l.flushUserInputLocked()
	}
}

// flushUserInputLocked processes accumulated user input and adds as a turn.
// Must be called with lock held. Lock will be released before I/O.
func (l *LLMLogger) flushUserInputLocked() {
	raw := l.inputBuffer
	l.inputBuffer = ""

	if raw == "" {
		return
	}

	conv, exists := l.conversations[l.activeConvID]
	if !exists {
		return
	}

	// MEMORY LIMIT: Cap turns to prevent unbounded growth
	if len(conv.Turns) >= maxTurnsPerConversation {
		log.Printf("[LLM Logger] ⚠️ Turn limit reached (%d), ending conversation", len(conv.Turns))
		l.endConversationLocked()
		return
	}

	// Clean the input using our new capture functions
	cleaned := CleanUserInput(raw)
	if cleaned == "" {
		return
	}

	conv.Turns = append(conv.Turns, ConversationTurn{
		Role:          "user",
		Content:       cleaned,
		Timestamp:     time.Now(),
		Provider:      conv.Provider,
		Raw:           raw,
		CaptureMethod: "pty_input",
	})

	// Update recovery info
	if conv.Recovery == nil {
		conv.Recovery = &ConversationRecovery{}
	}
	conv.Recovery.LastSavedTurn = len(conv.Turns) - 1
	conv.Recovery.CanRestore = true
	conv.Recovery.SuggestedRestorePrompt = "Continue from: " + truncateForRestore(cleaned, 100)

	// Make a shallow copy for async save to avoid holding the lock during I/O
	convCopy := *conv
	convCopyPtr := &convCopy
	activeConvID := l.activeConvID
	cleanedMsg := cleaned
	
	// Release lock before I/O to prevent blocking keyboard input
	l.mu.Unlock()
	defer l.mu.Lock()
	
	// Perform I/O asynchronously without holding the lock
	pendingAsyncWrites.Add(1)
	go func() {
		defer pendingAsyncWrites.Done()
		l.saveConversation(convCopyPtr)
	}()
	
	log.Printf("[LLM Logger] Captured user input for %s: '%s' (turns=%d)", activeConvID, truncateForLog(cleanedMsg, 50), len(conv.Turns))
}

// truncateForLog truncates a string for logging purposes.
func truncateForLog(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// truncateForRestore truncates a string for restore prompts.
func truncateForRestore(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// FlushOutput processes accumulated output and adds it as an assistant turn.
func (l *LLMLogger) FlushOutput() {
	l.mu.Lock()

	if l.activeConvID == "" || l.outputBuffer == "" {
		l.mu.Unlock()
		return
	}

	conv, exists := l.conversations[l.activeConvID]
	if !exists {
		l.mu.Unlock()
		return
	}

	raw := l.outputBuffer

	// Use new parsing with confidence scoring
	cleanedOutput, confidence := ParseAssistantOutput(raw, conv.Provider)
	if cleanedOutput == "" {
		// Fallback to old parser
		cleanedOutput = llm.ParseLLMOutput(raw, llm.Provider(conv.Provider))
	}

	if cleanedOutput == "" {
		l.outputBuffer = ""
		l.mu.Unlock()
		return
	}

	// Handle low confidence
	if confidence < 0.8 {
		log.Printf("[LLM Logger] ⚠️ Low parse confidence (%.2f) for assistant output", confidence)
		if l.autoRespond && l.onLowConfidence != nil {
			// In auto-respond mode, notify via callback (for Vision)
			l.onLowConfidence(raw)
		}
	}

	conv.Turns = append(conv.Turns, ConversationTurn{
		Role:            "assistant",
		Content:         cleanedOutput,
		Timestamp:       time.Now(),
		Provider:        conv.Provider,
		Raw:             raw,
		CaptureMethod:   "pty_output",
		ParseConfidence: confidence,
	})

	l.outputBuffer = ""
	
	// Make a shallow copy for async save to avoid holding the lock during I/O
	convCopy := *conv
	convCopyPtr := &convCopy
	
	l.mu.Unlock()
	
	// Perform I/O asynchronously without holding the lock
	pendingAsyncWrites.Add(1)
	go func() {
		defer pendingAsyncWrites.Done()
		l.saveConversation(convCopyPtr)
	}()

	log.Printf("[LLM Logger] Flushed output for %s (turns=%d, confidence=%.2f)", l.activeConvID, len(conv.Turns), confidence)
}

// EndConversation marks the active conversation as complete.
func (l *LLMLogger) EndConversation() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.activeConvID == "" {
		return
	}

	conv, exists := l.conversations[l.activeConvID]
	if !exists {
		l.activeConvID = ""
		return
	}

	// TUI Mode: Save final screen snapshot and parse turns
	if l.tuiCaptureMode && l.currentScreen.Len() > 0 {
		l.saveScreenSnapshotLocked()

		// Parse screen snapshots into conversation turns
		log.Printf("[LLM Logger] Parsing %d screen snapshots into turns...", len(conv.ScreenSnapshots))
		parsedTurns := l.parseScreenSnapshotsToTurns(conv.ScreenSnapshots, conv.Provider)

		// Add parsed turns to conversation
		for _, turn := range parsedTurns {
			conv.Turns = append(conv.Turns, turn)
		}

		log.Printf("[LLM Logger] Parsed %d turns from TUI snapshots", len(parsedTurns))
	}

	// Traditional mode: Flush remaining output buffer
	if !l.tuiCaptureMode && l.outputBuffer != "" {
		cleanedOutput := llm.ParseLLMOutput(l.outputBuffer, llm.Provider(conv.Provider))
		if cleanedOutput != "" {
			conv.Turns = append(conv.Turns, ConversationTurn{
				Role:      "assistant",
				Content:   cleanedOutput,
				Timestamp: time.Now(),
				Provider:  conv.Provider,
			})
		}
		l.outputBuffer = ""
	}

	conv.Complete = true
	conv.EndTime = time.Now()
	l.saveConversation(conv)

	EventBus.Publish(&LayerEvent{
		Type:      "LLM_END",
		Layer:     1,
		TabID:     l.tabID,
		ConvID:    l.activeConvID,
		Timestamp: time.Now(),
		Metadata: map[string]interface{}{
			"tuiMode":   l.tuiCaptureMode,
			"snapshots": len(conv.ScreenSnapshots),
			"turns":     len(conv.Turns),
		},
	})

	log.Printf("[LLM Logger] Ended conversation %s (TUI:%v, snapshots:%d, turns:%d)",
		l.activeConvID, l.tuiCaptureMode, len(conv.ScreenSnapshots), len(conv.Turns))

	l.activeConvID = ""
	l.tuiCaptureMode = false
	l.currentScreen.Reset()
	l.lastScreen = ""
	l.snapshotCount = 0
}

// ShouldFlushOutput checks if output buffer should be flushed.
func (l *LLMLogger) ShouldFlushOutput(threshold time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.outputBuffer == "" || l.activeConvID == "" {
		return false
	}
	return time.Since(l.lastOutputTime) > threshold
}

// GetActiveConversationID returns the current active conversation ID.
func (l *LLMLogger) GetActiveConversationID() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.activeConvID
}

// GetConversations returns all conversations for this tab.
func (l *LLMLogger) GetConversations() []*LLMConversation {
	l.mu.Lock()
	defer l.mu.Unlock()

	log.Printf("[LLM Logger] GetConversations called for tab %s", l.tabID)
	log.Printf("[LLM Logger] In-memory conversation map size: %d", len(l.conversations))
	log.Printf("[LLM Logger] Active conversation: '%s'", l.activeConvID)

	// Build map of in-memory conversation IDs for deduplication
	inMemory := make(map[string]bool)
	convs := make([]*LLMConversation, 0, len(l.conversations))

	// First, add all in-memory conversations
	for convID, conv := range l.conversations {
		log.Printf("[LLM Logger]   In-memory: ID=%s provider=%s type=%s complete=%v turns=%d snapshots=%d",
			convID, conv.Provider, conv.CommandType, conv.Complete, len(conv.Turns), len(conv.ScreenSnapshots))
		convs = append(convs, conv)
		inMemory[convID] = true
	}

	// Skip disk reads if we loaded recently (within 60 seconds) - performance optimization
	diskLoadCooldown := 60 * time.Second
	if time.Since(l.lastDiskLoadTime) < diskLoadCooldown {
		log.Printf("[LLM Logger] Skipping disk read (last load: %v ago)", time.Since(l.lastDiskLoadTime))
		log.Printf("[LLM Logger] Returning %d conversations from memory only", len(convs))
		return convs
	}

	// Also load any conversations from disk that aren't in memory
	// This handles cases where conversations were saved but memory was cleared
	if l.amDir != "" {
		l.lastDiskLoadTime = time.Now()
		patterns := []string{
			filepath.Join(l.amDir, "*-conv-*.json"),                            // New format
			filepath.Join(l.amDir, fmt.Sprintf("llm-conv-%s-*.json", l.tabID)), // Legacy format
		}

		allFiles := make(map[string]bool)
		for _, pattern := range patterns {
			files, err := filepath.Glob(pattern)
			if err == nil {
				for _, file := range files {
					allFiles[file] = true
				}
			}
		}

		for file := range allFiles {
			data, err := os.ReadFile(file)
			if err != nil {
				continue
			}

			var conv LLMConversation
			if err := json.Unmarshal(data, &conv); err != nil {
				continue
			}

			// Only add if not already in memory AND belongs to this tab
			if !inMemory[conv.ConversationID] && conv.TabID == l.tabID {
				log.Printf("[LLM Logger]   From disk: ID=%s provider=%s type=%s complete=%v turns=%d snapshots=%d",
					conv.ConversationID, conv.Provider, conv.CommandType, conv.Complete, len(conv.Turns), len(conv.ScreenSnapshots))
				convs = append(convs, &conv)
				// Also add to in-memory map for future calls
				l.conversations[conv.ConversationID] = &conv
			}
		}
	}

	log.Printf("[LLM Logger] Returning %d total conversations (%d from memory, %d loaded from disk)",
		len(convs), len(inMemory), len(convs)-len(inMemory))
	return convs
}

// GetConversation retrieves a specific conversation by ID.
func (l *LLMLogger) GetConversation(convID string) *LLMConversation {
	l.mu.Lock()
	defer l.mu.Unlock()

	// First check in-memory
	conv, exists := l.conversations[convID]
	if exists {
		return conv
	}

	// Not in memory - try loading from disk with both patterns
	if l.amDir != "" {
		// Try new format first - glob all conversation files and find by ID
		patterns := []string{
			filepath.Join(l.amDir, "*-conv-*.json"),
			filepath.Join(l.amDir, fmt.Sprintf("llm-conv-%s-%s.json", l.tabID, convID)), // Legacy exact match
		}

		for _, pattern := range patterns {
			files, err := filepath.Glob(pattern)
			if err != nil {
				continue
			}

			for _, file := range files {
				data, err := os.ReadFile(file)
				if err != nil {
					continue
				}

				var diskConv LLMConversation
				if err := json.Unmarshal(data, &diskConv); err != nil {
					continue
				}

				// Check if this is the conversation we're looking for AND belongs to this tab
				if diskConv.ConversationID == convID && diskConv.TabID == l.tabID {
					log.Printf("[LLM Logger] ✓ Loaded conversation %s from disk", convID)
					// Cache in memory for future calls
					l.conversations[convID] = &diskConv
					return &diskConv
				}
			}
		}
	}

	return nil
}

// GetAllConversations returns all conversations from disk across all tabs.
// Used for recovery/restore scenarios where you need to access conversations from other tabs.
func GetAllConversations(amDir string) ([]*LLMConversation, error) {
	if amDir == "" {
		amDir = DefaultAMDir()
	}

	patterns := []string{
		filepath.Join(amDir, "*-conv-*.json"),   // New format
		filepath.Join(amDir, "llm-conv-*.json"), // Legacy format
	}

	allFiles := make(map[string]bool)
	for _, pattern := range patterns {
		files, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, file := range files {
			allFiles[file] = true
		}
	}

	conversations := make([]*LLMConversation, 0)
	for file := range allFiles {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}

		var conv LLMConversation
		if err := json.Unmarshal(data, &conv); err != nil {
			continue
		}

		conversations = append(conversations, &conv)
	}

	return conversations, nil
}

// GetActiveConversations returns all active conversations across all tabs.
func GetActiveConversations() map[string]*LLMConversation {
	// Support test mode with injected mocks
	if testModeEnabled {
		return GetTestConversations()
	}

	llmLoggersMu.RLock()
	defer llmLoggersMu.RUnlock()

	result := make(map[string]*LLMConversation)
	for _, logger := range llmLoggers {
		logger.mu.Lock()
		if logger.activeConvID != "" {
			if conv, exists := logger.conversations[logger.activeConvID]; exists {
				result[logger.activeConvID] = conv
			}
		}
		logger.mu.Unlock()
	}
	return result
}

// saveConversationAsync saves conversation to disk without blocking.
// Used for snapshot saves to prevent keyboard lag.
func (l *LLMLogger) saveConversationAsync(conv *LLMConversation) {
	if l.amDir == "" {
		return
	}

	if err := os.MkdirAll(l.amDir, 0755); err != nil {
		log.Printf("[LLM Logger] ❌ Failed to create AM dir %s: %v", l.amDir, err)
		return
	}

	filename := l.generateConversationFilename(conv)
	filePath := filepath.Join(l.amDir, filename)

	data, err := json.MarshalIndent(conv, "", "  ")
	if err != nil {
		log.Printf("[LLM Logger] ❌ Failed to marshal conversation %s: %v", conv.ConversationID, err)
		return
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("[LLM Logger] ❌ Failed to write conversation to %s: %v", filePath, err)
		return
	}

	log.Printf("[LLM Logger] ✅ Async saved conversation %s to %s (%d bytes)",
		conv.ConversationID, filename, len(data))
}

func (l *LLMLogger) saveConversation(conv *LLMConversation) {
	if l.amDir == "" {
		log.Printf("[LLM Logger] ⚠️ saveConversation skipped: amDir is empty")
		return
	}

	if err := os.MkdirAll(l.amDir, 0755); err != nil {
		log.Printf("[LLM Logger] ❌ Failed to create AM dir %s: %v", l.amDir, err)
		return
	}

	filename := l.generateConversationFilename(conv)
	filePath := filepath.Join(l.amDir, filename)

	data, err := json.MarshalIndent(conv, "", "  ")
	if err != nil {
		log.Printf("[LLM Logger] ❌ Failed to marshal conversation %s: %v", conv.ConversationID, err)
		return
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("[LLM Logger] ❌ Failed to write conversation to %s: %v", filePath, err)
		return
	}

	log.Printf("[LLM Logger] ✅ Saved conversation %s to %s (%d bytes, %d turns, %d snapshots)",
		conv.ConversationID, filename, len(data), len(conv.Turns), len(conv.ScreenSnapshots))
}

// loadConversationsFromDisk loads existing conversations from disk for this tab.
// Only loads recent incomplete conversations to prevent memory bloat.
func (l *LLMLogger) loadConversationsFromDisk() {
	if l.amDir == "" {
		return
	}

	// Support both new and legacy file patterns
	patterns := []string{
		filepath.Join(l.amDir, "*-conv-*.json"),                            // New format
		filepath.Join(l.amDir, fmt.Sprintf("llm-conv-%s-*.json", l.tabID)), // Legacy format
	}

	allFiles := make(map[string]bool)
	for _, pattern := range patterns {
		files, err := filepath.Glob(pattern)
		if err != nil {
			log.Printf("[LLM Logger] Failed to glob pattern %s: %v", pattern, err)
			continue
		}
		for _, file := range files {
			allFiles[file] = true
		}
	}

	loadedCount := 0
	incompleteCount := 0

	// MEMORY OPTIMIZATION: Only load recent conversations (last 24 hours)
	// Older conversations can be loaded on-demand via GetConversation
	cutoffTime := time.Now().Add(-24 * time.Hour)

	for file := range allFiles {
		// Check file modification time first to skip old files
		info, err := os.Stat(file)
		if err != nil || info.ModTime().Before(cutoffTime) {
			continue
		}

		data, err := os.ReadFile(file)
		if err != nil {
			log.Printf("[LLM Logger] Failed to read %s: %v", file, err)
			continue
		}

		var conv LLMConversation
		if err := json.Unmarshal(data, &conv); err != nil {
			log.Printf("[LLM Logger] Failed to unmarshal %s: %v", file, err)
			continue
		}

		// Skip conversations that don't belong to this tab
		if conv.TabID != l.tabID {
			continue
		}

		// Only load incomplete conversations or very recent complete ones
		if !conv.Complete || conv.EndTime.After(cutoffTime) {
			l.conversations[conv.ConversationID] = &conv
			loadedCount++

			// Only restore active state for incomplete conversations
			if !conv.Complete {
				incompleteCount++
				// Restore the active conversation (most recent incomplete one)
				if conv.StartTime.After(cutoffTime) {
					l.activeConvID = conv.ConversationID
					l.tuiCaptureMode = conv.TUICaptureMode
					l.snapshotCount = len(conv.ScreenSnapshots)
					if l.snapshotCount > 0 {
						l.lastScreen = conv.ScreenSnapshots[l.snapshotCount-1].CleanedContent
					}
				}
			}

			log.Printf("[LLM Logger] ✓ Loaded conversation %s (%d turns, %d snapshots, complete=%v)",
				conv.ConversationID, len(conv.Turns), len(conv.ScreenSnapshots), conv.Complete)
		}
	}

	if loadedCount > 0 {
		log.Printf("[LLM Logger] Loaded %d recent conversation(s) from disk for tab %s (%d incomplete, %d complete)",
			loadedCount, l.tabID, incompleteCount, loadedCount-incompleteCount)
		if l.activeConvID != "" {
			log.Printf("[LLM Logger] Restored active conversation: %s", l.activeConvID)
		}
	}
}

// ============================================================================
// TEST HELPERS - Only used in tests to inject mock data
// ============================================================================

var (
	testModeEnabled         = false
	testMockConversations   map[string]*LLMConversation
	testMockConversationsMu sync.Mutex
)

// SetTestMode enables test mode for dependency injection
func SetTestMode(enabled bool) {
	if enabled {
		testModeEnabled = true
		testMockConversationsMu.Lock()
		testMockConversations = make(map[string]*LLMConversation)
		testMockConversationsMu.Unlock()
	} else {
		testModeEnabled = false
		testMockConversationsMu.Lock()
		testMockConversations = nil
		testMockConversationsMu.Unlock()
	}
}

// SetTestConversations sets conversations for testing (only in test mode)
func SetTestConversations(convs map[string]*LLMConversation) {
	if !testModeEnabled {
		log.Printf("[TEST] SetTestConversations called outside test mode - ignoring")
		return
	}
	testMockConversationsMu.Lock()
	defer testMockConversationsMu.Unlock()
	testMockConversations = convs
}

// GetTestConversations retrieves test conversations (only in test mode)
func GetTestConversations() map[string]*LLMConversation {
	if !testModeEnabled {
		return nil
	}
	testMockConversationsMu.Lock()
	defer testMockConversationsMu.Unlock()
	return testMockConversations
}

// ============================================================================
// METADATA AND PROJECT DETECTION HELPERS
// ============================================================================

// captureMetadata captures the current working directory, git branch, and shell type.
func (l *LLMLogger) captureMetadata() *ConversationMetadata {
	metadata := &ConversationMetadata{}

	// Capture working directory
	if cwd, err := os.Getwd(); err == nil {
		metadata.WorkingDirectory = cwd
	}

	// Try to get git branch
	if branch := getGitBranch(metadata.WorkingDirectory); branch != "" {
		metadata.GitBranch = branch
	}

	// Detect shell type
	metadata.ShellType = detectShell()

	return metadata
}

// getGitBranch attempts to get the current git branch for a directory.
func getGitBranch(dir string) string {
	if dir == "" {
		return ""
	}

	// Try to find .git directory
	gitRoot := findGitRoot(dir)
	if gitRoot == "" {
		return ""
	}

	// Read HEAD file to get branch
	headPath := filepath.Join(gitRoot, ".git", "HEAD")
	data, err := os.ReadFile(headPath)
	if err != nil {
		return ""
	}

	// HEAD file format: "ref: refs/heads/main\n"
	content := strings.TrimSpace(string(data))
	if strings.HasPrefix(content, "ref: refs/heads/") {
		return strings.TrimPrefix(content, "ref: refs/heads/")
	}

	// Detached HEAD - return short SHA or entire content if short
	if len(content) > 0 {
		if len(content) >= 7 {
			return content[:7]
		}
		return content
	}

	return ""
}

// findGitRoot searches upward from dir to find the git repository root.
func findGitRoot(dir string) string {
	if dir == "" {
		return ""
	}

	current := dir
	for {
		gitPath := filepath.Join(current, ".git")
		if info, err := os.Stat(gitPath); err == nil {
			if info.IsDir() {
				return current
			}
			// .git might be a file (submodule or worktree)
			return current
		}

		parent := filepath.Dir(current)
		if parent == current {
			// Reached root
			return ""
		}
		current = parent
	}
}

// detectShell attempts to detect the current shell type.
func detectShell() string {
	// Check SHELL environment variable
	if shell := os.Getenv("SHELL"); shell != "" {
		return filepath.Base(shell)
	}
	return "unknown"
}

// detectProject attempts to automatically detect the project name from working directory.
func detectProject(workingDir string) string {
	if workingDir == "" {
		return "adhoc"
	}

	// Normalize Windows paths to Unix-style
	workingDir = normalizePath(workingDir)

	// 1. Check for git repo - use repo name
	if gitRoot := findGitRoot(workingDir); gitRoot != "" {
		base := filepath.Base(gitRoot)
		if base != "" && base != "." && base != "/" {
			return sanitizeProjectName(base)
		}
	}

	// 2. Check for common project markers (package.json, go.mod, etc.)
	markers := []string{
		"package.json", "go.mod", "Cargo.toml", "pom.xml",
		"pyproject.toml", "composer.json", "Gemfile",
	}
	for _, marker := range markers {
		if _, err := os.Stat(filepath.Join(workingDir, marker)); err == nil {
			base := filepath.Base(workingDir)
			if base != "" && base != "." && base != "/" {
				return sanitizeProjectName(base)
			}
		}
	}

	// 3. Use basename of working directory if not home
	home := os.Getenv("HOME")
	if workingDir != home && workingDir != "" {
		base := filepath.Base(workingDir)
		if base != "" && base != "." && base != "/" {
			return sanitizeProjectName(base)
		}
	}

	// 4. Fallback to "adhoc"
	return "adhoc"
}

// sanitizeProjectName makes a project name safe for use in filenames.
func sanitizeProjectName(name string) string {
	// Replace spaces and special chars with hyphens
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, name)

	// Remove consecutive hyphens
	for strings.Contains(name, "--") {
		name = strings.ReplaceAll(name, "--", "-")
	}

	// Remove leading/trailing hyphens
	name = strings.Trim(name, "-")

	// Convert to lowercase
	name = strings.ToLower(name)

	// Limit length
	if len(name) > 50 {
		name = name[:50]
	}

	if name == "" {
		return "adhoc"
	}

	return name
}

// normalizePath converts Windows-style paths to Unix-style for consistent handling.
func normalizePath(path string) string {
	// Replace Windows backslashes with forward slashes
	path = strings.ReplaceAll(path, "\\", "/")
	// Clean up any double slashes
	for strings.Contains(path, "//") {
		path = strings.ReplaceAll(path, "//", "/")
	}
	return path
}

// generateConversationFilename creates a filename for a conversation using project-based naming.
// New format: {project}-conv-{timestamp}-{short-id}.json
func (l *LLMLogger) generateConversationFilename(conv *LLMConversation) string {
	// Detect project from metadata
	project := "adhoc"
	if conv.Metadata != nil && conv.Metadata.WorkingDirectory != "" {
		project = detectProject(conv.Metadata.WorkingDirectory)
	}

	// Format timestamp as YYYY-MM-DD-HHmm
	timestamp := conv.StartTime.Format("2006-01-02-1504")

	// Get short ID (first 8 chars of conversation ID)
	shortID := conv.ConversationID
	if strings.HasPrefix(shortID, "conv-") {
		// Remove "conv-" prefix
		shortID = shortID[5:]
		// Take first 8 chars if longer
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}
	} else if len(shortID) > 8 {
		// No prefix but still long, truncate
		shortID = shortID[:8]
	}

	return fmt.Sprintf("%s-conv-%s-%s.json", project, timestamp, shortID)
}

// GetProjectName returns the project name for a conversation (derived from metadata).
func (conv *LLMConversation) GetProjectName() string {
	if conv.Metadata != nil && conv.Metadata.WorkingDirectory != "" {
		return detectProject(conv.Metadata.WorkingDirectory)
	}
	return "adhoc"
}
