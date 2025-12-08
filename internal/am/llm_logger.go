// Package am provides LLM conversation logging.
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

// ConversationTurn represents a single exchange in an LLM conversation.
type ConversationTurn struct {
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	Provider  string    `json:"provider"`
}

// LLMConversation represents a complete LLM conversation session.
type LLMConversation struct {
	ConversationID string             `json:"conversationId"`
	TabID          string             `json:"tabId"`
	Provider       string             `json:"provider"`
	CommandType    string             `json:"commandType"`
	StartTime      time.Time          `json:"startTime"`
	EndTime        time.Time          `json:"endTime,omitempty"`
	Turns          []ConversationTurn `json:"turns"`
	Complete       bool               `json:"complete"`
}

// LLMLogger manages LLM conversation logging for a tab.
type LLMLogger struct {
	mu             sync.Mutex
	tabID          string
	conversations  map[string]*LLMConversation
	activeConvID   string
	outputBuffer   string
	lastOutputTime time.Time
	amDir          string
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

	l.outputBuffer += rawOutput
	l.lastOutputTime = time.Now()
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

	cleanedOutput := llm.ParseLLMOutput(l.outputBuffer, llm.Provider(conv.Provider))
	if cleanedOutput == "" {
		return
	}

	conv.Turns = append(conv.Turns, ConversationTurn{
		Role:      "assistant",
		Content:   cleanedOutput,
		Timestamp: time.Now(),
		Provider:  conv.Provider,
	})

	l.outputBuffer = ""
	l.saveConversation(conv)

	log.Printf("[LLM Logger] Flushed output for %s (turns=%d)", l.activeConvID, len(conv.Turns))
}

// EndConversation marks the active conversation as complete.
func (l *LLMLogger) EndConversation() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.activeConvID == "" {
		return
	}

	if l.outputBuffer != "" {
		if conv, exists := l.conversations[l.activeConvID]; exists {
			cleanedOutput := llm.ParseLLMOutput(l.outputBuffer, llm.Provider(conv.Provider))
			if cleanedOutput != "" {
				conv.Turns = append(conv.Turns, ConversationTurn{
					Role:      "assistant",
					Content:   cleanedOutput,
					Timestamp: time.Now(),
					Provider:  conv.Provider,
				})
			}
		}
		l.outputBuffer = ""
	}

	if conv, exists := l.conversations[l.activeConvID]; exists {
		conv.Complete = true
		conv.EndTime = time.Now()
		l.saveConversation(conv)

		EventBus.Publish(&LayerEvent{
			Type:      "LLM_END",
			Layer:     1,
			TabID:     l.tabID,
			ConvID:    l.activeConvID,
			Timestamp: time.Now(),
		})

		log.Printf("[LLM Logger] Ended conversation %s", l.activeConvID)
	}

	l.activeConvID = ""
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
