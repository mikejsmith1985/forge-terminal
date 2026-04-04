package review

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// Agent is the Quality Agent that reviews code diffs using an LLM.
// It analyzes naming, complexity, test coverage, architecture, and security —
// returning structured findings that the frontend renders in the PR Review Panel.
type Agent struct {
	// No state — each review is independent
}

// NewAgent creates a Quality Agent instance.
func NewAgent() *Agent {
	return &Agent{}
}

// reviewModelChain defines the LLM fallback order for code reviews.
// Uses slightly more capable models than tutor since reviews need precision.
var reviewModelChain = []struct {
	model string
	label string
}{
	{"gpt-4.1-mini", "gpt-4.1-mini"},
	{"gpt-4o-mini", "gpt-4o-mini"},
	{"gpt-4o", "gpt-4o"},
}

// Review performs a quality review on the given diff and returns a structured report.
func (a *Agent) Review(ctx context.Context, request ReviewRequest) (*ReviewReport, error) {
	if len(request.Diff) == 0 {
		return &ReviewReport{
			ProjectPath:   request.ProjectPath,
			FilesReviewed: 0,
			Findings:      []ReviewFinding{},
			Summary:       "No changes to review.",
			Score:         100,
			ReviewedAt:    time.Now(),
		}, nil
	}

	systemPrompt, userPrompt := buildReviewPrompt(request)
	combinedPrompt := systemPrompt + "\n\n" + userPrompt

	response, modelUsed, err := a.callLLM(ctx, combinedPrompt)
	if err != nil {
		return nil, fmt.Errorf("quality agent LLM call failed: %w", err)
	}

	report, err := parseReviewResponse(response)
	if err != nil {
		// If parsing fails, return a report with the raw response as summary
		log.Printf("[Review Agent] Failed to parse LLM response: %v", err)
		return &ReviewReport{
			ProjectPath:   request.ProjectPath,
			FilesReviewed: len(request.ChangedFiles),
			Findings:      []ReviewFinding{},
			Summary:       "Quality Agent produced an unparseable response. Raw: " + truncateString(response, 500),
			Score:         0,
			ReviewedAt:    time.Now(),
			ModelUsed:     modelUsed,
		}, nil
	}

	report.ProjectPath = request.ProjectPath
	report.FilesReviewed = len(request.ChangedFiles)
	report.ReviewedAt = time.Now()
	report.ModelUsed = modelUsed

	log.Printf("[Review Agent] Review complete: %d findings, score %d/100 (model: %s)",
		len(report.Findings), report.Score, modelUsed)

	return report, nil
}

// callLLM invokes the LLM with a model fallback chain via the Copilot CLI.
func (a *Agent) callLLM(ctx context.Context, prompt string) (string, string, error) {
	timeout := 180 * time.Second

	for i, model := range reviewModelChain {
		response, err := runReviewCLI(ctx, timeout, "copilot", []string{
			"--model", model.model,
			"-p", prompt,
			"-s",
			"--no-color",
		})
		if err == nil && strings.TrimSpace(response) != "" {
			log.Printf("[Review Agent] Got response from copilot/%s (%d bytes)", model.label, len(response))
			return response, "copilot/" + model.label, nil
		}

		if i < len(reviewModelChain)-1 {
			log.Printf("[Review Agent] copilot/%s failed, trying next model: %v", model.label, err)
		}
	}

	// Final fallback: Claude CLI
	response, err := runReviewCLI(ctx, timeout, "claude", []string{
		"-p", prompt,
		"--no-color",
	})
	if err == nil && strings.TrimSpace(response) != "" {
		log.Printf("[Review Agent] Got response from claude CLI (%d bytes)", len(response))
		return response, "claude", nil
	}

	return "", "", fmt.Errorf("all models in the review chain failed")
}

// runReviewCLI executes a CLI command with timeout and returns cleaned output.
func runReviewCLI(ctx context.Context, timeout time.Duration, command string, args []string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("executing %s: %w", command, err)
	}

	return cleanReviewOutput(string(output)), nil
}

// ansiRegex strips ANSI escape sequences from CLI output.
var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// cleanReviewOutput removes ANSI codes, carriage returns, and excess whitespace.
func cleanReviewOutput(output string) string {
	clean := ansiRegex.ReplaceAllString(output, "")
	clean = strings.ReplaceAll(clean, "\r", "")
	return strings.TrimSpace(clean)
}

// parseReviewResponse extracts the JSON review report from an LLM response.
// The LLM may wrap the JSON in markdown code fences; this function handles that.
func parseReviewResponse(response string) (*ReviewReport, error) {
	// Strip markdown code fences if present
	jsonContent := extractJSON(response)

	var parsed struct {
		Findings []ReviewFinding `json:"findings"`
		Summary  string          `json:"summary"`
		Score    int             `json:"score"`
	}

	if err := json.Unmarshal([]byte(jsonContent), &parsed); err != nil {
		return nil, fmt.Errorf("parsing review JSON: %w (input: %s)", err, truncateString(jsonContent, 200))
	}

	return &ReviewReport{
		Findings: parsed.Findings,
		Summary:  parsed.Summary,
		Score:    parsed.Score,
	}, nil
}

// extractJSON finds the first JSON object in a string, handling markdown code fences.
func extractJSON(input string) string {
	// Try to find JSON in code fence blocks first
	fencePattern := regexp.MustCompile("(?s)```(?:json)?\\s*\\n?(\\{.*?\\})\\s*\\n?```")
	if matches := fencePattern.FindStringSubmatch(input); len(matches) > 1 {
		return matches[1]
	}

	// Fall back to finding the first { ... } pair
	startIndex := strings.Index(input, "{")
	if startIndex == -1 {
		return input
	}

	// Find the matching closing brace by counting nesting depth
	depth := 0
	for i := startIndex; i < len(input); i++ {
		switch input[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return input[startIndex : i+1]
			}
		}
	}

	// No matching brace found — return from start
	return input[startIndex:]
}

// truncateString shortens a string to maxLength, appending "..." if truncated.
func truncateString(input string, maxLength int) string {
	if len(input) <= maxLength {
		return input
	}
	return input[:maxLength] + "..."
}
