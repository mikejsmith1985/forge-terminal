// Package llm provides output parsing for LLM CLI tools.
package llm

import (
	"regexp"
	"strings"
)

var (
	ansiPattern         = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	bracketedPasteStart = regexp.MustCompile(`\x1b\[(\?)?200[0-4]h`)
	bracketedPasteEnd   = regexp.MustCompile(`\x1b\[(\?)?200[0-4]l`)
	tuiFramePattern     = regexp.MustCompile(`[╭╮╯╰│─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]`)
	copilotFooter       = regexp.MustCompile(`(?i)(Ctrl\+c\s+Exit|Remaining\s+requests:|Enter\s+@\s+to\s+mention)`)
	copilotMenu         = regexp.MustCompile(`(?i)(Confirm with number keys|Cancel with Esc)`)
	multiNewline        = regexp.MustCompile(`\n{3,}`)
)

// CleanANSI removes all ANSI escape codes from text.
func CleanANSI(text string) string {
	cleaned := ansiPattern.ReplaceAllString(text, "")
	cleaned = bracketedPasteStart.ReplaceAllString(cleaned, "")
	cleaned = bracketedPasteEnd.ReplaceAllString(cleaned, "")

	var result strings.Builder
	for _, r := range cleaned {
		if r == '\n' || r == '\r' || r == '\t' || (r >= 32 && r < 127) || r >= 160 {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// ParseCopilotOutput extracts clean content from GitHub Copilot CLI output.
func ParseCopilotOutput(raw string) string {
	cleaned := CleanANSI(raw)
	cleaned = tuiFramePattern.ReplaceAllString(cleaned, "")

	var contentLines []string
	for _, line := range strings.Split(cleaned, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || len(trimmed) < 3 {
			continue
		}
		if copilotFooter.MatchString(trimmed) || copilotMenu.MatchString(trimmed) {
			continue
		}
		contentLines = append(contentLines, trimmed)
	}

	result := strings.Join(contentLines, "\n")
	result = strings.TrimSpace(result)
	result = multiNewline.ReplaceAllString(result, "\n\n")
	return result
}

// ParseClaudeOutput extracts clean content from Claude CLI output.
func ParseClaudeOutput(raw string) string {
	cleaned := CleanANSI(raw)
	cleaned = tuiFramePattern.ReplaceAllString(cleaned, "")
	cleaned = strings.TrimSpace(cleaned)
	cleaned = multiNewline.ReplaceAllString(cleaned, "\n\n")
	return cleaned
}

// ParseLLMOutput routes to provider-specific parser.
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
