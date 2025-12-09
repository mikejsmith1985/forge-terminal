// Package llm provides output parsing for LLM CLI tools.
package llm

import (
	"regexp"
	"strings"
)

var (
	// CSI sequences: ESC[ followed by optional ? or > or = for private modes, then params, then command
	// Matches: ESC[0m, ESC[1;31m, ESC[?25l, ESC[?2004h, ESC[>4;2m, etc.
	ansiCSI = regexp.MustCompile(`\x1b\[[?>=]?[0-9;]*[a-zA-Z]`)

	// OSC sequences: ESC] followed by number, semicolon, text, and BEL or ST
	// Matches: ESC]0;title^G, ESC]11;?^G (terminal queries)
	ansiOSC = regexp.MustCompile(`\x1b\][0-9]*;[^\x07\x1b]*(?:\x07|\x1b\\)`)

	// Simple escape sequences: ESC followed by single character
	// Matches: ESC7, ESC8, ESCM, etc.
	ansiSimple = regexp.MustCompile(`\x1b[78DMEH=>]`)

	// DCS sequences: ESC P ... ESC \
	ansiDCS = regexp.MustCompile(`\x1bP[^\x1b]*\x1b\\`)

	// Orphaned CSI artifacts: literal [? sequences that remain after ESC was stripped
	// This catches cases where ESC was already removed but bracket sequences remain
	orphanedCSI = regexp.MustCompile(`\[\??[0-9;]*[a-zA-Z]`)

	// Bracketed paste mode (kept for explicit handling)
	bracketedPasteStart = regexp.MustCompile(`\x1b\[\??200[0-4]h`)
	bracketedPasteEnd   = regexp.MustCompile(`\x1b\[\??200[0-4]l`)

	// TUI frame characters
	tuiFramePattern = regexp.MustCompile(`[╭╮╯╰│─┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬]`)

	// Copilot CLI specific patterns
	copilotFooter = regexp.MustCompile(`(?i)(Ctrl\+c\s+Exit|Remaining\s+requests:|Enter\s+@\s+to\s+mention)`)
	copilotMenu   = regexp.MustCompile(`(?i)(Confirm with number keys|Cancel with Esc)`)

	// Multiple newlines
	multiNewline = regexp.MustCompile(`\n{3,}`)
)

// CleanANSI removes all ANSI escape codes from text.
func CleanANSI(text string) string {
	// First pass: Remove all standard ANSI sequences (with ESC byte intact)
	cleaned := ansiCSI.ReplaceAllString(text, "")
	cleaned = ansiOSC.ReplaceAllString(cleaned, "")
	cleaned = ansiSimple.ReplaceAllString(cleaned, "")
	cleaned = ansiDCS.ReplaceAllString(cleaned, "")
	cleaned = bracketedPasteStart.ReplaceAllString(cleaned, "")
	cleaned = bracketedPasteEnd.ReplaceAllString(cleaned, "")

	// Second pass: Remove orphaned CSI artifacts (where ESC was already stripped)
	// This handles cases like [?25l, [?2004h that remain after ESC removal
	cleaned = orphanedCSI.ReplaceAllString(cleaned, "")

	// Third pass: Filter remaining control characters
	var result strings.Builder
	for _, r := range cleaned {
		// Keep: newline, carriage return, tab, printable ASCII, high Unicode
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
