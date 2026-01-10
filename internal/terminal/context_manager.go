// Package terminal provides PTY-based terminal session management.
package terminal

import (
	"strings"
	"sync"
)

// PersistentContext stores context injection configuration for a terminal session.
type PersistentContext struct {
	Enabled bool   `json:"enabled"`
	Text    string `json:"text"`
}

// ContextManager manages persistent contexts per terminal session (tab).
// Thread-safe for concurrent access across WebSocket handlers.
type ContextManager struct {
	contexts map[string]*PersistentContext // sessionID → context
	mu       sync.RWMutex
}

// NewContextManager creates a new context manager.
func NewContextManager() *ContextManager {
	return &ContextManager{
		contexts: make(map[string]*PersistentContext),
	}
}

// SetContext stores or updates the persistent context for a session.
func (cm *ContextManager) SetContext(sessionID string, ctx *PersistentContext) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.contexts[sessionID] = ctx
}

// GetContext retrieves the persistent context for a session.
// Returns nil if no context is set for the session.
func (cm *ContextManager) GetContext(sessionID string) *PersistentContext {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.contexts[sessionID]
}

// ClearContext removes the persistent context for a session.
func (cm *ContextManager) ClearContext(sessionID string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	delete(cm.contexts, sessionID)
}

// IsLLMCommand detects if a command should receive context injection.
// Returns true for LLM/AI tool commands, false for shell commands.
func IsLLMCommand(cmd string) bool {
	// Trim whitespace and convert to lowercase for case-insensitive matching
	trimmed := strings.TrimSpace(cmd)
	lower := strings.ToLower(trimmed)

	// Empty command is not an LLM command
	if lower == "" {
		return false
	}

	// Special case: subagent invocation (@reviewer, @architect, etc.)
	if strings.HasPrefix(trimmed, "@") {
		return true
	}

	// Check for known LLM CLI tools
	llmPrefixes := []string{
		"copilot",    // GitHub Copilot CLI (bare or with args)
		"gh copilot", // GitHub CLI copilot extension
		"claude",     // Claude CLI
		"aider",      // Aider AI assistant
	}

	for _, prefix := range llmPrefixes {
		// Check if command starts with prefix and is either exact or followed by space
		if lower == prefix || strings.HasPrefix(lower, prefix+" ") {
			return true
		}
	}

	return false
}
