// Package am provides LLM-specific logging for conversation tracking
package am

import (
"encoding/json"
"fmt"
"log"
"os"
"path/filepath"
"sync"
"time"

"github.com/mikejsmith1985/forge-terminal/internal/llm"
)

// ConversationTurn represents a single exchange in an LLM conversation
type ConversationTurn struct {
Role      string                 `json:"role"`      // "user" or "assistant"
Content   string                 `json:"content"`   // Clean text content
Timestamp time.Time              `json:"timestamp"`
Provider  llm.Provider           `json:"provider"`
Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// LLMConversation represents a complete LLM conversation session
type LLMConversation struct {
ConversationID string             `json:"conversationId"`
TabID          string             `json:"tabId"`
Provider       llm.Provider       `json:"provider"`
CommandType    llm.CommandType    `json:"commandType"`
StartTime      time.Time          `json:"startTime"`
EndTime        time.Time          `json:"endTime,omitempty"`
Turns          []ConversationTurn `json:"turns"`
Complete       bool               `json:"complete"`
}

// LLMLogger manages LLM conversation logging
type LLMLogger struct {
mu             sync.Mutex
tabID          string
conversations  map[string]*LLMConversation // map[conversationID]*LLMConversation
activeConvID   string                      // Current active conversation
outputBuffer   string                      // Buffer for accumulating multi-line responses
lastOutputTime time.Time
}

var (
llmLoggers   = make(map[string]*LLMLogger) // map[tabID]*LLMLogger
llmLoggersMu sync.RWMutex
)

// GetLLMLogger returns or creates an LLM logger for a tab
func GetLLMLogger(tabID string) *LLMLogger {
llmLoggersMu.Lock()
defer llmLoggersMu.Unlock()

if logger, exists := llmLoggers[tabID]; exists {
log.Printf("[LLM Logger] Returning existing logger for tab %s (conversations: %d)", 
	tabID, len(logger.conversations))
return logger
}

logger := &LLMLogger{
tabID:         tabID,
conversations: make(map[string]*LLMConversation),
}
llmLoggers[tabID] = logger
log.Printf("[LLM Logger] Created NEW logger for tab %s", tabID)
return logger
}

// StartConversation initiates a new LLM conversation
func (l *LLMLogger) StartConversation(detected *llm.DetectedCommand) string {
l.mu.Lock()
defer l.mu.Unlock()

convID := fmt.Sprintf("conv-%d", time.Now().UnixNano())

log.Printf("[LLM Logger] Starting conversation: tabID=%s convID=%s provider=%s", 
	l.tabID, convID, detected.Provider)

conv := &LLMConversation{
ConversationID: convID,
TabID:          l.tabID,
Provider:       detected.Provider,
CommandType:    detected.Type,
StartTime:      time.Now(),
Turns:          []ConversationTurn{},
Complete:       false,
}

// Add user prompt as first turn
conv.Turns = append(conv.Turns, ConversationTurn{
Role:      "user",
Content:   detected.Prompt,
Timestamp: time.Now(),
Provider:  detected.Provider,
})

l.conversations[convID] = conv
l.activeConvID = convID
l.outputBuffer = ""
l.lastOutputTime = time.Now()

log.Printf("[LLM Logger] Conversation started, saving initial state...")
l.saveConversation(conv)
log.Printf("[LLM Logger] Initial conversation saved")

return convID
}

// AddOutput accumulates LLM output (may be called multiple times for streaming responses)
func (l *LLMLogger) AddOutput(rawOutput string) {
l.mu.Lock()
defer l.mu.Unlock()

if l.activeConvID == "" {
log.Printf("[LLM Logger] AddOutput called but NO active conversation (output size: %d bytes)", len(rawOutput))
return
}

l.outputBuffer += rawOutput
l.lastOutputTime = time.Now()

// Debug: Show buffer accumulation
if len(l.outputBuffer) > 0 && len(l.outputBuffer)%1000 == 0 {
	log.Printf("[LLM Logger] Buffer size: %d bytes (activeConv=%s)", len(l.outputBuffer), l.activeConvID)
} else if len(l.outputBuffer) <= 1000 {
	// Log smaller increments for initial output
	if len(l.outputBuffer)%100 == 0 {
		log.Printf("[LLM Logger] Buffer accumulating: %d bytes (activeConv=%s)", len(l.outputBuffer), l.activeConvID)
	}
}
}

// FlushOutput processes accumulated output and adds it as an assistant turn
func (l *LLMLogger) FlushOutput() {
l.mu.Lock()
defer l.mu.Unlock()

if l.activeConvID == "" || l.outputBuffer == "" {
return
}

conv, exists := l.conversations[l.activeConvID]
if !exists {
log.Printf("[LLM Logger] ⚠️ FlushOutput: conversation %s not found", l.activeConvID)
return
}

log.Printf("[LLM Logger] Flushing output buffer: %d bytes", len(l.outputBuffer))

// Parse and clean the output
cleanedOutput := llm.ParseLLMOutput(l.outputBuffer, conv.Provider)

log.Printf("[LLM Logger] Cleaned output: %d bytes", len(cleanedOutput))

if cleanedOutput == "" {
log.Printf("[LLM Logger] ⚠️ No useful content after cleaning")
return // Nothing useful to log
}

// Add as assistant turn
conv.Turns = append(conv.Turns, ConversationTurn{
Role:      "assistant",
Content:   cleanedOutput,
Timestamp: time.Now(),
Provider:  conv.Provider,
})

log.Printf("[LLM Logger] Added assistant turn (turn count: %d)", len(conv.Turns))

// Clear buffer
l.outputBuffer = ""

// Save to disk
l.saveConversation(conv)
}

// EndConversation marks the active conversation as complete
func (l *LLMLogger) EndConversation() {
l.mu.Lock()
defer l.mu.Unlock()

if l.activeConvID == "" {
log.Printf("[LLM Logger] EndConversation called but NO active conversation")
return
}

log.Printf("[LLM Logger] Ending conversation: %s (buffer size: %d bytes)", l.activeConvID, len(l.outputBuffer))

// Flush any remaining output
if l.outputBuffer != "" {
log.Printf("[LLM Logger] Flushing remaining buffer before ending conversation")
if conv, exists := l.conversations[l.activeConvID]; exists {
cleanedOutput := llm.ParseLLMOutput(l.outputBuffer, conv.Provider)
if cleanedOutput != "" {
conv.Turns = append(conv.Turns, ConversationTurn{
Role:      "assistant",
Content:   cleanedOutput,
Timestamp: time.Now(),
Provider:  conv.Provider,
})
log.Printf("[LLM Logger] Added final assistant turn")
}
}
l.outputBuffer = ""
}

if conv, exists := l.conversations[l.activeConvID]; exists {
conv.Complete = true
conv.EndTime = time.Now()
l.saveConversation(conv)
log.Printf("[LLM Logger] ✅ Conversation %s marked as complete", l.activeConvID)
} else {
log.Printf("[LLM Logger] ❌ ERROR: Conversation %s not found in map", l.activeConvID)
}

l.activeConvID = ""
log.Printf("[LLM Logger] Active conversation cleared")
}

// saveConversation writes conversation to disk as JSON
func (l *LLMLogger) saveConversation(conv *LLMConversation) {
amDir := GetAMDir()
log.Printf("[LLM Logger] Saving conversation to: %s", amDir)

if err := ensureDir(amDir); err != nil {
log.Printf("[LLM Logger] ❌ Failed to create AM dir: %v", err)
return
}

filename := fmt.Sprintf("llm-conv-%s-%s.json", l.tabID, conv.ConversationID)
filepath := filepath.Join(amDir, filename)

log.Printf("[LLM Logger] Writing to file: %s", filepath)

data, err := json.MarshalIndent(conv, "", "  ")
if err != nil {
log.Printf("[LLM Logger] ❌ Failed to marshal conversation: %v", err)
return
}

log.Printf("[LLM Logger] JSON data size: %d bytes", len(data))

if err := os.WriteFile(filepath, data, 0644); err != nil {
log.Printf("[LLM Logger] ❌ Failed to write conversation: %v", err)
return
}

log.Printf("[LLM Logger] ✅ Conversation saved successfully: %s", filename)
}

// GetConversations returns all conversations for this tab
func (l *LLMLogger) GetConversations() []*LLMConversation {
l.mu.Lock()
defer l.mu.Unlock()

convs := make([]*LLMConversation, 0, len(l.conversations))
for _, conv := range l.conversations {
convs = append(convs, conv)
}
return convs
}

// ShouldFlushOutput checks if output buffer should be flushed (based on inactivity)
func (l *LLMLogger) ShouldFlushOutput(inactivityThreshold time.Duration) bool {
l.mu.Lock()
defer l.mu.Unlock()

if l.outputBuffer == "" || l.activeConvID == "" {
if l.activeConvID != "" && l.outputBuffer == "" {
	log.Printf("[LLM Logger] ShouldFlushOutput: activeConv=%s but buffer is empty", l.activeConvID)
}
return false
}

inactiveDuration := time.Since(l.lastOutputTime)
shouldFlush := inactiveDuration > inactivityThreshold

log.Printf("[LLM Logger] ShouldFlushOutput: buffer=%d bytes, inactive=%v, threshold=%v, shouldFlush=%v", 
	len(l.outputBuffer), inactiveDuration, inactivityThreshold, shouldFlush)

return shouldFlush
}

// GetActiveConversationID returns the current active conversation ID (for debugging)
func (l *LLMLogger) GetActiveConversationID() string {
l.mu.Lock()
defer l.mu.Unlock()
return l.activeConvID
}
