// Package llm provides output parsing for LLM CLI tools
package llm

import (
"regexp"
"strings"
)

var (
// ANSI escape code patterns
ansiPattern = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// Bracketed paste mode markers
bracketedPasteStart = regexp.MustCompile(`\x1b\[(\?)?200[0-4]h`)
bracketedPasteEnd   = regexp.MustCompile(`\x1b\[(\?)?200[0-4]l`)

// Box drawing and TUI frame characters
tuiFramePattern = regexp.MustCompile(`[╭╮╯╰│─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]`)

// GitHub Copilot TUI patterns
copilotFooterPattern = regexp.MustCompile(`(?i)(Ctrl\+c\s+Exit|Remaining\s+requests:|Enter\s+@\s+to\s+mention)`)
copilotMenuPattern   = regexp.MustCompile(`(?i)(Confirm with number keys|Cancel with Esc)`)
)

// CleanANSI removes all ANSI escape codes from text
func CleanANSI(text string) string {
// Remove ANSI color/style codes
cleaned := ansiPattern.ReplaceAllString(text, "")

// Remove bracketed paste mode markers
cleaned = bracketedPasteStart.ReplaceAllString(cleaned, "")
cleaned = bracketedPasteEnd.ReplaceAllString(cleaned, "")

// Remove other control characters except newlines and tabs
var result strings.Builder
for _, r := range cleaned {
// Keep printable chars, newlines, tabs
if r == '\n' || r == '\r' || r == '\t' || (r >= 32 && r < 127) || r >= 160 {
result.WriteRune(r)
}
}

return result.String()
}

// ParseCopilotOutput extracts clean content from GitHub Copilot CLI TUI output
func ParseCopilotOutput(raw string) string {
// First pass: clean ANSI codes
cleaned := CleanANSI(raw)

// Remove TUI frame characters
cleaned = tuiFramePattern.ReplaceAllString(cleaned, "")

// Remove footer/menu lines
lines := strings.Split(cleaned, "\n")
var contentLines []string

for _, line := range lines {
trimmed := strings.TrimSpace(line)

// Skip empty lines
if trimmed == "" {
continue
}

// Skip footer patterns
if copilotFooterPattern.MatchString(trimmed) {
continue
}

// Skip menu instruction lines
if copilotMenuPattern.MatchString(trimmed) {
continue
}

// Skip lines that are just box drawing remnants
if len(trimmed) < 3 {
continue
}

contentLines = append(contentLines, trimmed)
}

result := strings.Join(contentLines, "\n")

// Clean up excessive whitespace
result = strings.TrimSpace(result)
result = regexp.MustCompile(`\n{3,}`).ReplaceAllString(result, "\n\n")

return result
}

// ParseClaudeOutput extracts clean content from Claude CLI output
func ParseClaudeOutput(raw string) string {
// Claude has simpler output, mostly just needs ANSI cleaning
cleaned := CleanANSI(raw)

// Remove TUI frames if present
cleaned = tuiFramePattern.ReplaceAllString(cleaned, "")

// Basic cleanup
cleaned = strings.TrimSpace(cleaned)
cleaned = regexp.MustCompile(`\n{3,}`).ReplaceAllString(cleaned, "\n\n")

return cleaned
}

// ParseLLMOutput routes to provider-specific parser
func ParseLLMOutput(raw string, provider Provider) string {
switch provider {
case ProviderGitHubCopilot:
return ParseCopilotOutput(raw)
case ProviderClaude:
return ParseClaudeOutput(raw)
default:
return CleanANSI(raw)
}
}

// ExtractPromptFromCommand extracts the actual prompt text from a command line
func ExtractPromptFromCommand(cmdLine string) string {
detected := DetectCommand(cmdLine)
if detected.Detected {
return detected.Prompt
}
return ""
}
