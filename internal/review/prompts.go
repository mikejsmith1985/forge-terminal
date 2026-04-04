package review

import "fmt"

// buildReviewPrompt constructs the system + user prompt for the Quality Agent.
// The prompt instructs the LLM to analyze a diff and return structured JSON findings.
func buildReviewPrompt(request ReviewRequest) (string, string) {
	systemPrompt := `You are a senior code reviewer — the "Quality Agent" — performing an automated review of a pull request diff. Your job is to find real issues, not nitpick formatting.

Rules:
1. Focus ONLY on the areas requested in the focus_areas list.
2. Match your strictness level: lenient = only clear bugs/violations, standard = bugs + code smells, strict = everything including style.
3. Return valid JSON only — no markdown, no explanations outside the JSON structure.
4. Each finding MUST have a concrete suggestion for how to fix it.
5. The score is 0-100 where 100 = perfect, 0 = critical issues throughout.
6. Be precise with file paths and line numbers from the diff.
7. Do NOT flag issues in deleted lines (lines starting with -).
8. Focus on added/modified lines (lines starting with +).

Response format (JSON only):
{
  "findings": [
    {
      "filePath": "path/to/file.go",
      "line": 42,
      "severity": "critical|warning|info",
      "focusArea": "naming|complexity|tests|architecture|security",
      "title": "One-line summary",
      "description": "Detailed explanation of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "One paragraph overall assessment",
  "score": 85
}`

	focusAreasList := ""
	for i, area := range request.FocusAreas {
		if i > 0 {
			focusAreasList += ", "
		}
		focusAreasList += string(area)
	}

	userPrompt := fmt.Sprintf(`Review this pull request diff.

Strictness: %s
Focus areas: %s
Changed files: %d

--- DIFF START ---
%s
--- DIFF END ---`,
		request.Strictness,
		focusAreasList,
		len(request.ChangedFiles),
		truncateDiff(request.Diff, maxDiffLength),
	)

	return systemPrompt, userPrompt
}

const maxDiffLength = 80_000 // Characters — keeps the prompt under most model context limits

// truncateDiff cuts a diff to maxLength characters, preserving complete lines.
// Appends a truncation notice so the reviewer knows it's incomplete.
func truncateDiff(diff string, maxLength int) string {
	if len(diff) <= maxLength {
		return diff
	}

	// Find the last newline before the limit to avoid splitting mid-line
	truncated := diff[:maxLength]
	lastNewline := len(truncated) - 1
	for lastNewline > 0 && truncated[lastNewline] != '\n' {
		lastNewline--
	}
	if lastNewline > 0 {
		truncated = truncated[:lastNewline]
	}

	return truncated + "\n\n[... diff truncated — " +
		fmt.Sprintf("%d/%d characters shown ...]", len(truncated), len(diff))
}
