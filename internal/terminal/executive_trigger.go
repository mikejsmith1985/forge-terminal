// Package terminal provides the executive trigger handler for smart model routing.
package terminal

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// stripANSILocal removes ANSI escape codes from text.
// Local copy to avoid import cycle.
func stripANSILocal(input string) string {
	ansiPattern := regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)
	return ansiPattern.ReplaceAllString(input, "")
}

// ExecutiveTriggerHandler handles "?" command routing.
type ExecutiveTriggerHandler struct {
	mu           sync.Mutex
	classifier   *llm.TaskClassifier
	configLoader *llm.ConfigLoader
	visionParser *vision.Parser
	lastRouting  time.Time
	cooldown     time.Duration // Prevent rapid-fire triggers
}

// NewExecutiveTriggerHandler creates a new executive trigger handler.
func NewExecutiveTriggerHandler(vp *vision.Parser) *ExecutiveTriggerHandler {
	// Load config from current working directory
	cwd, _ := os.Getwd()
	_ = llm.LoadConfig(cwd)

	return &ExecutiveTriggerHandler{
		classifier:   llm.NewTaskClassifier(),
		configLoader: llm.GetGlobalConfigLoader(),
		visionParser: vp,
		cooldown:     500 * time.Millisecond,
	}
}

// RoutingResult contains the result of routing a prompt.
type RoutingResult struct {
	Tier        llm.ModelTier
	ToolName    string
	Command     string
	Prompt      string
	HasVision   bool
	VisionCtx   string
}

// IsExecutiveTrigger checks if the input line is an executive trigger.
// Returns true if the line starts with "?" and has content after it.
func IsExecutiveTrigger(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "?") {
		return false
	}
	// Must have content after the "?"
	prompt := strings.TrimSpace(strings.TrimPrefix(trimmed, "?"))
	return len(prompt) > 0
}

// ExtractPrompt extracts the prompt from an executive trigger line.
func ExtractPrompt(line string) string {
	trimmed := strings.TrimSpace(line)
	return strings.TrimSpace(strings.TrimPrefix(trimmed, "?"))
}

// Route classifies the prompt and builds the routed command.
func (eth *ExecutiveTriggerHandler) Route(prompt string) *RoutingResult {
	eth.mu.Lock()
	defer eth.mu.Unlock()

	// Cooldown check
	if time.Since(eth.lastRouting) < eth.cooldown {
		log.Printf("[Executive] Cooldown active, skipping trigger")
		return nil
	}
	eth.lastRouting = time.Now()

	// Clean the prompt
	cleanPrompt := stripANSILocal(prompt)

	// 1. Classify the task
	tier := eth.classifier.ClassifyTask(cleanPrompt)
	log.Printf("[Executive] Prompt '%s' classified as tier: %s", truncate(cleanPrompt, 50), tier)

	// 2. Build execution context
	ctx := &llm.ExecutionContext{
		Prompt:    cleanPrompt,
		Cwd:       getCwd(),
		GitBranch: getGitBranch(),
	}

	// 3. Add Vision context if available
	result := &RoutingResult{
		Tier:   tier,
		Prompt: cleanPrompt,
	}

	config := eth.configLoader.GetConfig()
	if config.IncludeVision && eth.visionParser != nil {
		if summary := eth.visionParser.GetLastImageSummary(); summary != "" {
			ctx.VisionSummary = summary
			// Prepend to prompt for context
			ctx.Prompt = fmt.Sprintf("[Context: Forge Vision saw %s] %s", summary, cleanPrompt)
			result.HasVision = true
			result.VisionCtx = summary
			log.Printf("[Executive] Added Vision context: %s", truncate(summary, 50))
		}
	}

	// 4. Build the command
	command := eth.configLoader.BuildCommand(tier, ctx)
	tierConfig := eth.configLoader.GetTierConfig(tier)

	result.ToolName = tierConfig.Name
	result.Command = command

	log.Printf("[Executive] Routed to %s: %s", tierConfig.Name, truncate(command, 80))

	return result
}

// Handle executes the routing for a prompt, writing the command to the PTY.
func (eth *ExecutiveTriggerHandler) Handle(
	prompt string,
	session *TerminalSession,
	notifyFn func(tier string, toolName string, prompt string),
) error {
	result := eth.Route(prompt)
	if result == nil {
		return fmt.Errorf("routing failed or cooldown active")
	}

	// Notify frontend of routing
	if notifyFn != nil {
		notifyFn(string(result.Tier), result.ToolName, result.Prompt)
	}

	// Execute in PTY (non-blocking write)
	log.Printf("[Executive] Executing: %s", result.Command)
	if _, err := session.Write([]byte(result.Command + "\r")); err != nil {
		return fmt.Errorf("failed to write command to PTY: %w", err)
	}

	return nil
}

// getCwd returns the current working directory.
func getCwd() string {
	cwd, err := os.Getwd()
	if err != nil {
		return ""
	}
	return cwd
}

// getGitBranch returns the current git branch name.
func getGitBranch() string {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

// truncate truncates a string to the specified length.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// LineBuffer accumulates input bytes to detect complete lines.
type LineBuffer struct {
	mu     sync.Mutex
	buffer strings.Builder
}

// NewLineBuffer creates a new line buffer.
func NewLineBuffer() *LineBuffer {
	return &LineBuffer{}
}

// Add adds bytes to the buffer and returns any complete lines.
// A complete line is detected when \r or \n is encountered.
func (lb *LineBuffer) Add(data []byte) []string {
	lb.mu.Lock()
	defer lb.mu.Unlock()

	var lines []string

	for _, b := range data {
		if b == '\r' || b == '\n' {
			line := lb.buffer.String()
			if len(strings.TrimSpace(line)) > 0 {
				lines = append(lines, line)
			}
			lb.buffer.Reset()
		} else {
			lb.buffer.WriteByte(b)
		}
	}

	return lines
}

// Current returns the current incomplete line.
func (lb *LineBuffer) Current() string {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	return lb.buffer.String()
}

// Reset clears the buffer.
func (lb *LineBuffer) Reset() {
	lb.mu.Lock()
	defer lb.mu.Unlock()
	lb.buffer.Reset()
}
