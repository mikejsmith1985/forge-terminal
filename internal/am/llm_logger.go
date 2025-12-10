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
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	Timestamp      time.Time `json:"timestamp"`
	Provider       string    `json:"provider"`
	Raw            string    `json:"raw,omitempty"`            // Raw PTY data for debugging
	CaptureMethod  string    `json:"captureMethod,omitempty"`  // "pty_input", "pty_output", "tui_snapshot"
	ParseConfidence float64  `json:"parseConfidence,omitempty"` // 0.0-1.0 for output parsing
}

// ConversationRecovery holds recovery metadata for a conversation.
type ConversationRecovery struct {
	LastSavedTurn        int    `json:"lastSavedTurn"`
	InProgressTurn       *int   `json:"inProgressTurn,omitempty"`
	CanRestore           bool   `json:"canRestore"`
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
	ConversationID   string               `json:"conversationId"`
	TabID            string               `json:"tabId"`
	Provider         string               `json:"provider"`
	CommandType      string               `json:"commandType"`
	StartTime        time.Time            `json:"startTime"`
	EndTime          time.Time            `json:"endTime,omitempty"`
	Turns            []ConversationTurn   `json:"turns"`
	Complete         bool                 `json:"complete"`
	AutoRespond      bool                 `json:"autoRespond"`
	Metadata         *ConversationMetadata `json:"metadata,omitempty"`
	Recovery         *ConversationRecovery `json:"recovery,omitempty"`
	TUICaptureMode   bool                 `json:"tuiCaptureMode,omitempty"`
	ScreenSnapshots  []ScreenSnapshot     `json:"screenSnapshots,omitempty"`
	ProcessPID       int                  `json:"processPID,omitempty"`
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
)

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
		ConversationID: convID,
		TabID:          l.tabID,
		Provider:       provider,
		CommandType:    cmdType,
		StartTime:      time.Now(),
		Turns:          []ConversationTurn{},
		Complete:       false,
		TUICaptureMode: true,
		ProcessPID:     pid,
		ScreenSnapshots: []ScreenSnapshot{},
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

	// TUI Capture Mode: Detect screen clears and save snapshots
	if l.tuiCaptureMode {
		l.currentScreen.WriteString(rawOutput)
		
		// Detect screen clear sequences (ESC[2J or ESC[H or ESC[2J ESC[H)
		if l.detectScreenClear(rawOutput) {
			l.saveScreenSnapshotLocked()
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
	l.currentScreen.Reset()
	
	log.Printf("[LLM Logger] 📸 Snapshot #%d saved for %s (%d chars, %d total snapshots)", 
		l.snapshotCount, l.activeConvID, len(cleanedContent), len(conv.ScreenSnapshots))
	
	// Save to disk
	l.saveConversation(conv)
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

	// Detect Enter press (user submitted prompt)
	if strings.Contains(rawInput, "\r") || strings.Contains(rawInput, "\n") {
		l.flushUserInputLocked()
	}
}

// flushUserInputLocked processes accumulated user input and adds as a turn.
// Must be called with lock held.
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

	l.saveConversation(conv)
	log.Printf("[LLM Logger] Captured user input for %s: '%s' (turns=%d)", l.activeConvID, truncateForLog(cleaned, 50), len(conv.Turns))
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
	defer l.mu.Unlock()

	if l.activeConvID == "" || l.outputBuffer == "" {
		return
	}

	conv, exists := l.conversations[l.activeConvID]
	if !exists {
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
	l.saveConversation(conv)

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
			"tuiMode":    l.tuiCaptureMode,
			"snapshots":  len(conv.ScreenSnapshots),
			"turns":      len(conv.Turns),
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
	log.Printf("[LLM Logger] Conversation map size: %d", len(l.conversations))
	log.Printf("[LLM Logger] Active conversation: '%s'", l.activeConvID)

	convs := make([]*LLMConversation, 0, len(l.conversations))
	for convID, conv := range l.conversations {
		log.Printf("[LLM Logger]   Conversation: ID=%s provider=%s type=%s complete=%v turns=%d", 
			convID, conv.Provider, conv.CommandType, conv.Complete, len(conv.Turns))
		convs = append(convs, conv)
	}
	
	log.Printf("[LLM Logger] Returning %d conversations", len(convs))
	return convs
}

// GetActiveConversations returns all active conversations across all tabs.
func GetActiveConversations() map[string]*LLMConversation {
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

func (l *LLMLogger) saveConversation(conv *LLMConversation) {
	if l.amDir == "" {
		return
	}

	if err := os.MkdirAll(l.amDir, 0755); err != nil {
		log.Printf("[LLM Logger] Failed to create AM dir: %v", err)
		return
	}

	filename := fmt.Sprintf("llm-conv-%s-%s.json", l.tabID, conv.ConversationID)
	filePath := filepath.Join(l.amDir, filename)

	data, err := json.MarshalIndent(conv, "", "  ")
	if err != nil {
		log.Printf("[LLM Logger] Failed to marshal conversation: %v", err)
		return
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		log.Printf("[LLM Logger] Failed to write conversation: %v", err)
		return
	}
}
