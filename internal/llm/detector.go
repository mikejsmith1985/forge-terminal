// Package llm provides LLM command detection and conversation tracking for AI CLI tools.
package llm

import (
"regexp"
"strings"
)

// Provider represents an LLM CLI provider
type Provider string

const (
ProviderGitHubCopilot Provider = "github-copilot"
ProviderClaude        Provider = "claude"
ProviderUnknown       Provider = "unknown"
)

// CommandType represents the type of LLM command
type CommandType string

const (
CommandSuggest CommandType = "suggest"
CommandExplain CommandType = "explain"
CommandChat    CommandType = "chat"
CommandUnknown CommandType = "unknown"
)

// DetectedCommand represents a detected LLM command
type DetectedCommand struct {
Provider Provider
Type     CommandType
Prompt   string
RawInput string
Detected bool
}

var (
// GitHub Copilot patterns
copilotSuggestPattern = regexp.MustCompile(`^gh\s+copilot\s+suggest\s+(.+)$`)
copilotExplainPattern = regexp.MustCompile(`^gh\s+copilot\s+explain\s+(.+)$`)
copilotChatPattern    = regexp.MustCompile(`^gh\s+copilot\s+(.+)$`)

// Claude CLI patterns
claudePattern = regexp.MustCompile(`^claude\s+(.+)$`)
)

// DetectCommand analyzes input to determine if it's an LLM command
func DetectCommand(input string) *DetectedCommand {
trimmed := strings.TrimSpace(input)

// GitHub Copilot detection
if matches := copilotSuggestPattern.FindStringSubmatch(trimmed); matches != nil {
return &DetectedCommand{
Provider: ProviderGitHubCopilot,
Type:     CommandSuggest,
Prompt:   extractPrompt(matches[1]),
RawInput: input,
Detected: true,
}
}

if matches := copilotExplainPattern.FindStringSubmatch(trimmed); matches != nil {
return &DetectedCommand{
Provider: ProviderGitHubCopilot,
Type:     CommandExplain,
Prompt:   extractPrompt(matches[1]),
RawInput: input,
Detected: true,
}
}

// Generic copilot command (interactive mode)
if matches := copilotChatPattern.FindStringSubmatch(trimmed); matches != nil {
// Check if it's not one of the specific commands
if !strings.HasPrefix(trimmed, "gh copilot suggest") &&
!strings.HasPrefix(trimmed, "gh copilot explain") {
return &DetectedCommand{
Provider: ProviderGitHubCopilot,
Type:     CommandChat,
Prompt:   extractPrompt(matches[1]),
RawInput: input,
Detected: true,
}
}
}

// Claude CLI detection
if matches := claudePattern.FindStringSubmatch(trimmed); matches != nil {
return &DetectedCommand{
Provider: ProviderClaude,
Type:     CommandChat,
Prompt:   extractPrompt(matches[1]),
RawInput: input,
Detected: true,
}
}

return &DetectedCommand{
Provider: ProviderUnknown,
Type:     CommandUnknown,
RawInput: input,
Detected: false,
}
}

// extractPrompt removes quotes and cleans the prompt text
func extractPrompt(raw string) string {
// Remove surrounding quotes if present
cleaned := strings.TrimSpace(raw)
if len(cleaned) >= 2 {
if (cleaned[0] == '"' && cleaned[len(cleaned)-1] == '"') ||
(cleaned[0] == '\'' && cleaned[len(cleaned)-1] == '\'') {
cleaned = cleaned[1 : len(cleaned)-1]
}
}
return cleaned
}

// IsLLMCommand is a convenience method to check if input is an LLM command
func IsLLMCommand(input string) bool {
return DetectCommand(input).Detected
}
