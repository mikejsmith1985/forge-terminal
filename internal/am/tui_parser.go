// Package am provides TUI screen snapshot parsing for conversation recovery.
package am

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"
)

// parseScreenSnapshotsToTurns extracts conversation turns from TUI screen snapshots.
// This enables post-crash recovery by analyzing screen diffs.
func (l *LLMLogger) parseScreenSnapshotsToTurns(snapshots []ScreenSnapshot, provider string) []ConversationTurn {
	if len(snapshots) == 0 {
		return []ConversationTurn{}
	}

	log.Printf("[TUI Parser] Parsing %d snapshots for provider: %s", len(snapshots), provider)

	switch provider {
	case "github-copilot":
		return parseCopilotSnapshots(snapshots)
	case "claude":
		return parseClaudeSnapshots(snapshots)
	case "aider":
		return parseAiderSnapshots(snapshots)
	default:
		return parseGenericTUISnapshots(snapshots)
	}
}

// parseCopilotSnapshots extracts turns from GitHub Copilot CLI TUI snapshots.
func parseCopilotSnapshots(snapshots []ScreenSnapshot) []ConversationTurn {
	turns := []ConversationTurn{}
	
	// GitHub Copilot TUI patterns
	// User input typically appears after ">" prompt
	// AI responses appear in the main content area
	
	for i, snapshot := range snapshots {
		content := snapshot.CleanedContent
		
		// Try to identify if this snapshot contains a user prompt
		userPrompt := extractCopilotUserPrompt(content)
		if userPrompt != "" {
			turns = append(turns, ConversationTurn{
				Role:            "user",
				Content:         userPrompt,
				Timestamp:       snapshot.Timestamp,
				Provider:        "github-copilot",
				CaptureMethod:   "tui_snapshot",
				ParseConfidence: 0.7,
			})
			log.Printf("[TUI Parser] Copilot turn %d: user prompt detected", i)
		}
		
		// Try to identify if this snapshot contains an AI response
		aiResponse := extractCopilotAIResponse(content)
		if aiResponse != "" {
			turns = append(turns, ConversationTurn{
				Role:            "assistant",
				Content:         aiResponse,
				Timestamp:       snapshot.Timestamp,
				Provider:        "github-copilot",
				CaptureMethod:   "tui_snapshot",
				ParseConfidence: 0.7,
			})
			log.Printf("[TUI Parser] Copilot turn %d: AI response detected", i)
		}
	}
	
	log.Printf("[TUI Parser] Extracted %d turns from Copilot snapshots", len(turns))
	return turns
}

// extractCopilotUserPrompt tries to extract user input from Copilot TUI.
func extractCopilotUserPrompt(content string) string {
	// Look for content after ">" prompt line
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, ">") && len(trimmed) > 2 {
			// Found prompt line, extract content after ">"
			prompt := strings.TrimSpace(trimmed[1:])
			if len(prompt) > 3 && !strings.Contains(prompt, "Enter @") {
				return prompt
			}
		}
		// Alternative: Look for "Question:" or "Prompt:" labels
		if strings.Contains(trimmed, "Question:") || strings.Contains(trimmed, "Prompt:") {
			if i+1 < len(lines) {
				return strings.TrimSpace(lines[i+1])
			}
		}
	}
	return ""
}

// extractCopilotAIResponse tries to extract AI response from Copilot TUI.
func extractCopilotAIResponse(content string) string {
	// Copilot responses often appear in the main content area
	// Look for multi-line content blocks
	lines := strings.Split(content, "\n")
	var response strings.Builder
	inResponseBlock := false
	
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// Skip UI chrome
		if strings.Contains(trimmed, "────") || 
		   strings.Contains(trimmed, "Ctrl+") ||
		   strings.Contains(trimmed, "GitHub Copilot") ||
		   len(trimmed) == 0 {
			continue
		}
		
		// Skip prompt lines
		if strings.HasPrefix(trimmed, ">") && len(trimmed) < 100 {
			continue
		}
		
		// Collect content lines
		if len(trimmed) > 10 && !strings.HasPrefix(trimmed, "│") {
			if inResponseBlock {
				response.WriteString(" ")
			}
			response.WriteString(trimmed)
			inResponseBlock = true
		}
	}
	
	result := response.String()
	if len(result) > 20 {
		return result
	}
	return ""
}

// parseClaudeSnapshots extracts turns from Claude CLI TUI snapshots.
func parseClaudeSnapshots(snapshots []ScreenSnapshot) []ConversationTurn {
	turns := []ConversationTurn{}
	
	for i, snapshot := range snapshots {
		content := snapshot.CleanedContent
		
		// Claude TUI patterns (similar to Copilot but different markers)
		userPrompt := extractGenericUserPrompt(content, []string{">", "You:", "User:"})
		if userPrompt != "" {
			turns = append(turns, ConversationTurn{
				Role:            "user",
				Content:         userPrompt,
				Timestamp:       snapshot.Timestamp,
				Provider:        "claude",
				CaptureMethod:   "tui_snapshot",
				ParseConfidence: 0.7,
			})
			log.Printf("[TUI Parser] Claude turn %d: user prompt detected", i)
		}
		
		aiResponse := extractGenericAIResponse(content, []string{"Claude:", "Assistant:", "AI:"})
		if aiResponse != "" {
			turns = append(turns, ConversationTurn{
				Role:            "assistant",
				Content:         aiResponse,
				Timestamp:       snapshot.Timestamp,
				Provider:        "claude",
				CaptureMethod:   "tui_snapshot",
				ParseConfidence: 0.7,
			})
			log.Printf("[TUI Parser] Claude turn %d: AI response detected", i)
		}
	}
	
	log.Printf("[TUI Parser] Extracted %d turns from Claude snapshots", len(turns))
	return turns
}

// parseAiderSnapshots extracts turns from Aider CLI (traditional CLI, not TUI).
func parseAiderSnapshots(snapshots []ScreenSnapshot) []ConversationTurn {
	// Aider is line-based, not full-screen TUI
	// But we still capture snapshots, so parse them
	turns := []ConversationTurn{}
	
	for i, snapshot := range snapshots {
		content := snapshot.CleanedContent
		
		// Aider shows "> " for user input
		// And shows responses directly
		lines := strings.Split(content, "\n")
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "> ") && len(trimmed) > 3 {
				turns = append(turns, ConversationTurn{
					Role:            "user",
					Content:         strings.TrimSpace(trimmed[2:]),
					Timestamp:       snapshot.Timestamp,
					Provider:        "aider",
					CaptureMethod:   "tui_snapshot",
					ParseConfidence: 0.9,
				})
			}
		}
		
		log.Printf("[TUI Parser] Aider snapshot %d: parsed %d turns", i, len(turns))
	}
	
	return turns
}

// parseGenericTUISnapshots provides fallback parsing for unknown TUI tools.
func parseGenericTUISnapshots(snapshots []ScreenSnapshot) []ConversationTurn {
	turns := []ConversationTurn{}
	
	// Generic strategy: 
	// 1. Each snapshot diff is a "turn"
	// 2. Try to identify speaker based on heuristics
	
	for i, snapshot := range snapshots {
		if snapshot.DiffFromPrevious == "" || snapshot.DiffFromPrevious == "Initial screen" {
			continue
		}
		
		// Create a turn from the diff
		// Label as "system" since we can't reliably determine speaker
		turns = append(turns, ConversationTurn{
			Role:            "system",
			Content:         fmt.Sprintf("Screen update #%d:\n%s", i+1, snapshot.DiffFromPrevious),
			Timestamp:       snapshot.Timestamp,
			Provider:        "unknown",
			CaptureMethod:   "tui_snapshot",
			ParseConfidence: 0.5,
		})
	}
	
	log.Printf("[TUI Parser] Generic parsing: extracted %d turn snapshots", len(turns))
	return turns
}

// extractGenericUserPrompt extracts user input based on common markers.
func extractGenericUserPrompt(content string, markers []string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		for _, marker := range markers {
			if strings.HasPrefix(trimmed, marker) && len(trimmed) > len(marker)+3 {
				prompt := strings.TrimSpace(trimmed[len(marker):])
				// Filter out UI chrome
				if !strings.Contains(prompt, "Enter @") && 
				   !strings.Contains(prompt, "Ctrl+") &&
				   len(prompt) > 5 {
					return prompt
				}
			}
		}
	}
	return ""
}

// extractGenericAIResponse extracts AI response based on common markers.
func extractGenericAIResponse(content string, markers []string) string {
	lines := strings.Split(content, "\n")
	var response strings.Builder
	capturing := false
	
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// Check if line starts with AI marker
		for _, marker := range markers {
			if strings.HasPrefix(trimmed, marker) {
				capturing = true
				response.WriteString(strings.TrimSpace(trimmed[len(marker):]))
				response.WriteString(" ")
				break
			}
		}
		
		// If already capturing, continue until we hit a user marker or UI chrome
		if capturing {
			if strings.HasPrefix(trimmed, ">") || 
			   strings.Contains(trimmed, "────") ||
			   strings.Contains(trimmed, "Ctrl+") {
				break
			}
			if len(trimmed) > 5 {
				response.WriteString(trimmed)
				response.WriteString(" ")
			}
		}
	}
	
	result := strings.TrimSpace(response.String())
	if len(result) > 10 {
		return result
	}
	return ""
}

// ExtractConversationSummary creates a human-readable summary of a TUI conversation.
// Used for crash recovery UI display.
func ExtractConversationSummary(conv *LLMConversation) string {
	var summary strings.Builder
	
	summary.WriteString(fmt.Sprintf("Provider: %s\n", conv.Provider))
	summary.WriteString(fmt.Sprintf("Started: %s\n", conv.StartTime.Format(time.RFC3339)))
	if !conv.EndTime.IsZero() {
		summary.WriteString(fmt.Sprintf("Ended: %s\n", conv.EndTime.Format(time.RFC3339)))
	} else {
		summary.WriteString("Status: Incomplete (crashed/disconnected)\n")
	}
	
	summary.WriteString(fmt.Sprintf("\nConversation turns: %d\n", len(conv.Turns)))
	summary.WriteString(fmt.Sprintf("Screen snapshots: %d\n", len(conv.ScreenSnapshots)))
	
	if len(conv.Turns) > 0 {
		summary.WriteString("\nTurn summary:\n")
		for i, turn := range conv.Turns {
			if i >= 5 {
				summary.WriteString(fmt.Sprintf("... and %d more turns\n", len(conv.Turns)-5))
				break
			}
			preview := turn.Content
			if len(preview) > 100 {
				preview = preview[:100] + "..."
			}
			summary.WriteString(fmt.Sprintf("%d. [%s] %s\n", i+1, turn.Role, preview))
		}
	}
	
	if conv.TUICaptureMode && len(conv.ScreenSnapshots) > 0 {
		summary.WriteString("\nRecovery: Full TUI session captured. Screen snapshots available for review.\n")
	}
	
	return summary.String()
}

// CleanTUIContent removes common TUI chrome and formatting artifacts.
func CleanTUIContent(content string) string {
	// Remove box drawing characters
	boxChars := regexp.MustCompile(`[─│┌┐└┘├┤┬┴┼╭╮╰╯╔╗╚╝╠╣╦╩╬]`)
	cleaned := boxChars.ReplaceAllString(content, "")
	
	// Remove repeated separator lines
	sepLines := regexp.MustCompile(`\n[-─=]{3,}\n`)
	cleaned = sepLines.ReplaceAllString(cleaned, "\n")
	
	// Remove UI hints
	uiHints := []string{
		"Ctrl+c Exit",
		"Ctrl+r Expand",
		"Enter @ to mention",
		"/ for commands",
		"↑↓ keys",
	}
	for _, hint := range uiHints {
		cleaned = strings.ReplaceAll(cleaned, hint, "")
	}
	
	// Normalize whitespace
	lines := strings.Split(cleaned, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if len(trimmed) > 0 {
			result = append(result, trimmed)
		}
	}
	
	return strings.Join(result, "\n")
}
