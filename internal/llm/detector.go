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
// GitHub Copilot CLI patterns (standalone copilot command)
// Users type: copilot (then interact in TUI)
copilotPattern = regexp.MustCompile(`^copilot\s*$`)

// Claude CLI patterns
// Users type: claude (then interact in TUI)
claudePattern = regexp.MustCompile(`^claude\s*$`)
)

// DetectCommand analyzes input to determine if it's an LLM command
func DetectCommand(input string) *DetectedCommand {
trimmed := strings.TrimSpace(input)

// GitHub Copilot CLI detection (standalone command)
// User just types: copilot
if copilotPattern.MatchString(trimmed) {
return &DetectedCommand{
Provider: ProviderGitHubCopilot,
Type:     CommandChat,
Prompt:   "", // Interactive TUI mode, no initial prompt
RawInput: input,
Detected: true,
}
}

// Claude CLI detection
// User just types: claude
if claudePattern.MatchString(trimmed) {
return &DetectedCommand{
Provider: ProviderClaude,
Type:     CommandChat,
Prompt:   "", // Interactive TUI mode, no initial prompt
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

// IsLLMCommand is a convenience method to check if input is an LLM command
func IsLLMCommand(input string) bool {
return DetectCommand(input).Detected
}
