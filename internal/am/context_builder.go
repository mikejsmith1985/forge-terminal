// Package am provides context building for session restoration.
package am

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// RestoreContext represents all information needed to restore a conversation.
type RestoreContext struct {
	ConversationID   string            `json:"conversationId"`
	TabID            string            `json:"tabId"`
	Provider         string            `json:"provider"`
	StartTime        time.Time         `json:"startTime"`
	LastActivity     time.Time         `json:"lastActivity"`
	TurnCount        int               `json:"turnCount"`
	WasAutoRespond   bool              `json:"wasAutoRespond"`
	WasInterrupted   bool              `json:"wasInterrupted"`
	Metadata         *ConversationMetadata `json:"metadata,omitempty"`
	Summary          string            `json:"summary"`
	RestorePrompt    string            `json:"restorePrompt"`
	FullContext      string            `json:"fullContext"`
	LastUserPrompt   string            `json:"lastUserPrompt,omitempty"`
	LastAssistantMsg string            `json:"lastAssistantMsg,omitempty"`
}

// RecoverableSession represents a session that can be recovered.
type RecoverableSession struct {
	FilePath      string         `json:"filePath"`
	Conversation  *LLMConversation `json:"conversation"`
	RestoreContext *RestoreContext `json:"restoreContext"`
}

// ContextBuilder creates restore contexts from conversation logs.
type ContextBuilder struct {
	amDir string
}

// NewContextBuilder creates a new context builder.
func NewContextBuilder(amDir string) *ContextBuilder {
	return &ContextBuilder{amDir: amDir}
}

// BuildRestoreContext creates a RestoreContext from a conversation.
func (cb *ContextBuilder) BuildRestoreContext(conv *LLMConversation) *RestoreContext {
	if conv == nil || len(conv.Turns) == 0 {
		return nil
	}

	ctx := &RestoreContext{
		ConversationID: conv.ConversationID,
		TabID:          conv.TabID,
		Provider:       conv.Provider,
		StartTime:      conv.StartTime,
		TurnCount:      len(conv.Turns),
		WasAutoRespond: conv.AutoRespond,
		WasInterrupted: !conv.Complete,
		Metadata:       conv.Metadata,
	}

	// Find last activity time
	if len(conv.Turns) > 0 {
		ctx.LastActivity = conv.Turns[len(conv.Turns)-1].Timestamp
	}

	// Extract last user prompt and assistant message
	for i := len(conv.Turns) - 1; i >= 0; i-- {
		turn := conv.Turns[i]
		if turn.Role == "user" && ctx.LastUserPrompt == "" {
			ctx.LastUserPrompt = turn.Content
		}
		if turn.Role == "assistant" && ctx.LastAssistantMsg == "" {
			ctx.LastAssistantMsg = truncate(turn.Content, 500)
		}
		if ctx.LastUserPrompt != "" && ctx.LastAssistantMsg != "" {
			break
		}
	}

	// Build summary
	ctx.Summary = cb.buildSummary(conv)

	// Build restore prompt
	ctx.RestorePrompt = cb.buildRestorePrompt(conv)

	// Build full context (for injection into new session)
	ctx.FullContext = cb.buildFullContext(conv)

	return ctx
}

// buildSummary creates a human-readable summary of the conversation.
func (cb *ContextBuilder) buildSummary(conv *LLMConversation) string {
	var sb strings.Builder

	// Count turns by role
	userTurns := 0
	assistantTurns := 0
	for _, turn := range conv.Turns {
		if turn.Role == "user" {
			userTurns++
		} else if turn.Role == "assistant" {
			assistantTurns++
		}
	}

	duration := ""
	if len(conv.Turns) > 0 {
		start := conv.StartTime
		end := conv.Turns[len(conv.Turns)-1].Timestamp
		d := end.Sub(start)
		if d < time.Minute {
			duration = fmt.Sprintf("%ds", int(d.Seconds()))
		} else {
			duration = fmt.Sprintf("%dm", int(d.Minutes()))
		}
	}

	sb.WriteString(fmt.Sprintf("%s session with %d exchanges", conv.Provider, userTurns))
	if duration != "" {
		sb.WriteString(fmt.Sprintf(" over %s", duration))
	}

	if conv.Metadata != nil && conv.Metadata.WorkingDirectory != "" {
		dir := filepath.Base(conv.Metadata.WorkingDirectory)
		sb.WriteString(fmt.Sprintf(" in %s", dir))
	}

	if !conv.Complete {
		sb.WriteString(" (interrupted)")
	}

	return sb.String()
}

// buildRestorePrompt creates a prompt for continuing the conversation.
func (cb *ContextBuilder) buildRestorePrompt(conv *LLMConversation) string {
	if len(conv.Turns) == 0 {
		return ""
	}

	var sb strings.Builder

	// Find last meaningful exchange
	var lastUserPrompt string
	var lastAssistantResponse string

	for i := len(conv.Turns) - 1; i >= 0; i-- {
		turn := conv.Turns[i]
		if turn.Role == "user" && lastUserPrompt == "" {
			lastUserPrompt = turn.Content
		}
		if turn.Role == "assistant" && lastAssistantResponse == "" {
			lastAssistantResponse = turn.Content
		}
		if lastUserPrompt != "" && lastAssistantResponse != "" {
			break
		}
	}

	// Build restore prompt
	if lastUserPrompt != "" {
		sb.WriteString("I was working on: ")
		sb.WriteString(truncate(lastUserPrompt, 200))

		if lastAssistantResponse != "" {
			sb.WriteString("\n\nYou had started helping with this. Please continue from where we left off.")
		}
	}

	return sb.String()
}

// buildFullContext creates the complete conversation context for injection.
func (cb *ContextBuilder) buildFullContext(conv *LLMConversation) string {
	var sb strings.Builder

	sb.WriteString("=== Previous Session Context ===\n\n")

	if conv.Metadata != nil {
		if conv.Metadata.WorkingDirectory != "" {
			sb.WriteString(fmt.Sprintf("Working Directory: %s\n", conv.Metadata.WorkingDirectory))
		}
		if conv.Metadata.GitBranch != "" {
			sb.WriteString(fmt.Sprintf("Git Branch: %s\n", conv.Metadata.GitBranch))
		}
	}

	sb.WriteString(fmt.Sprintf("Session Start: %s\n", conv.StartTime.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("Provider: %s\n\n", conv.Provider))

	sb.WriteString("=== Conversation History ===\n\n")

	for i, turn := range conv.Turns {
		role := strings.Title(turn.Role)
		content := turn.Content

		// Truncate very long turns
		if len(content) > 1000 {
			content = content[:1000] + "\n... [truncated]"
		}

		sb.WriteString(fmt.Sprintf("[%d] %s:\n%s\n\n", i+1, role, content))
	}

	if !conv.Complete {
		sb.WriteString("=== Session was interrupted ===\n")
		sb.WriteString("Please continue from where we left off.\n")
	}

	return sb.String()
}

// GetRecoverableSessions finds all sessions that can be recovered.
func (cb *ContextBuilder) GetRecoverableSessions() ([]*RecoverableSession, error) {
	// Support both new and legacy file patterns
	patterns := []string{
		filepath.Join(cb.amDir, "*-conv-*.json"),     // New format
		filepath.Join(cb.amDir, "llm-conv-*.json"),   // Legacy format
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

	var sessions []*RecoverableSession

	for file := range allFiles {
		conv, err := cb.loadConversation(file)
		if err != nil {
			continue
		}

		// Only include incomplete (interrupted) conversations
		if conv.Complete {
			continue
		}

		// Only include conversations with actual content
		if len(conv.Turns) == 0 {
			continue
		}

		ctx := cb.BuildRestoreContext(conv)
		if ctx == nil {
			continue
		}

		sessions = append(sessions, &RecoverableSession{
			FilePath:       file,
			Conversation:   conv,
			RestoreContext: ctx,
		})
	}

	// Sort by last activity (most recent first)
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].RestoreContext.LastActivity.After(sessions[j].RestoreContext.LastActivity)
	})

	return sessions, nil
}

// GetRestoreContextByID retrieves restore context for a specific conversation.
func (cb *ContextBuilder) GetRestoreContextByID(conversationID string) (*RestoreContext, error) {
	// Find the conversation file
	pattern := filepath.Join(cb.amDir, fmt.Sprintf("llm-conv-*-%s.json", conversationID))
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}

	// If not found with suffix, try loading all and matching
	if len(files) == 0 {
		allPattern := filepath.Join(cb.amDir, "llm-conv-*.json")
		allFiles, _ := filepath.Glob(allPattern)
		for _, f := range allFiles {
			conv, err := cb.loadConversation(f)
			if err != nil {
				continue
			}
			if conv.ConversationID == conversationID {
				return cb.BuildRestoreContext(conv), nil
			}
		}
		return nil, fmt.Errorf("conversation not found: %s", conversationID)
	}

	conv, err := cb.loadConversation(files[0])
	if err != nil {
		return nil, err
	}

	return cb.BuildRestoreContext(conv), nil
}

// loadConversation loads a conversation from a JSON file.
func (cb *ContextBuilder) loadConversation(path string) (*LLMConversation, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var conv LLMConversation
	if err := json.Unmarshal(data, &conv); err != nil {
		return nil, err
	}

	return &conv, nil
}

// MarkAsRestored marks a conversation as restored (complete).
func (cb *ContextBuilder) MarkAsRestored(conversationID string) error {
	sessions, err := cb.GetRecoverableSessions()
	if err != nil {
		return err
	}

	for _, session := range sessions {
		if session.Conversation.ConversationID == conversationID {
			session.Conversation.Complete = true
			session.Conversation.EndTime = time.Now()

			data, err := json.MarshalIndent(session.Conversation, "", "  ")
			if err != nil {
				return err
			}

			return os.WriteFile(session.FilePath, data, 0644)
		}
	}

	return fmt.Errorf("conversation not found: %s", conversationID)
}

// truncate truncates a string to maxLen with ellipsis.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
