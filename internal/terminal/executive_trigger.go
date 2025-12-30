// Package terminal provides the executive trigger handler for smart model routing.
package terminal

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/slm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

// ActiveProcessInfo tracks what LLM process is currently running in the session.
type ActiveProcessInfo struct {
	Provider    llm.Provider    // github-copilot, claude, aider, unknown
	CommandType llm.CommandType // chat, suggest, code, etc.
	RawCommand  string          // The original command that was launched
	StartTime   time.Time       // When the process was started
	Tier        llm.ModelTier   // Which tier this maps to
}

// TierMismatchAction defines what to do when the routed tier doesn't match active process.
type TierMismatchAction string

const (
	TierMismatchLaunch TierMismatchAction = "launch" // Launch the correct tier command
	TierMismatchWarn   TierMismatchAction = "warn"   // Warn user about mismatch
	TierMismatchSkip   TierMismatchAction = "skip"   // Skip and use current process
)

// stripANSILocal removes ANSI escape codes from text.
// Local copy to avoid import cycle.
func stripANSILocal(input string) string {
	ansiPattern := regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)
	return ansiPattern.ReplaceAllString(input, "")
}

// ExecutiveTriggerHandler handles "?" command routing.
type ExecutiveTriggerHandler struct {
	mu            sync.Mutex
	classifier    *llm.TaskClassifier // Fallback heuristic classifier
	configLoader  *llm.ConfigLoader
	visionParser  *vision.Parser
	lastRouting   time.Time
	cooldown      time.Duration       // Prevent rapid-fire triggers
	activeProcess *ActiveProcessInfo  // Tracks what LLM is currently running
	llmDetector   *llm.Detector       // Detects LLM commands
	slmProvider   slm.Provider        // v3.5.3: Real SLM analysis (replaces heuristics)
}

// NewExecutiveTriggerHandler creates a new executive trigger handler.
func NewExecutiveTriggerHandler(vp *vision.Parser) *ExecutiveTriggerHandler {
	// Load config from current working directory
	cwd, _ := os.Getwd()
	_ = llm.LoadConfig(cwd)

	handler := &ExecutiveTriggerHandler{
		classifier:   llm.NewTaskClassifier(),
		configLoader: llm.GetGlobalConfigLoader(),
		visionParser: vp,
		cooldown:     500 * time.Millisecond,
		llmDetector:  llm.NewDetector(),
	}
	
	// v3.5.3: Initialize SLM provider for real task analysis
	handler.initSLMProvider()
	
	return handler
}

// initSLMProvider initializes the SLM provider (Ollama or LlamaCpp).
func (eth *ExecutiveTriggerHandler) initSLMProvider() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	// Try Ollama first (most common)
	ollamaProvider := slm.NewOllamaProvider()
	if ollamaProvider.IsAvailable() {
		if err := ollamaProvider.Initialize(ctx); err == nil {
			eth.slmProvider = ollamaProvider
			log.Printf("[Executive] SLM initialized with Ollama provider")
			return
		}
	}
	
	// Try LlamaCpp as fallback
	llamaProvider := slm.NewLlamaCppProvider()
	if llamaProvider.IsAvailable() {
		if err := llamaProvider.Initialize(ctx); err == nil {
			eth.slmProvider = llamaProvider
			log.Printf("[Executive] SLM initialized with LlamaCpp provider")
			return
		}
	}
	
	// No SLM available - will fall back to heuristic classifier
	log.Printf("[Executive] No SLM provider available - using heuristic fallback")
}

// SetActiveProcess updates the currently active LLM process.
func (eth *ExecutiveTriggerHandler) SetActiveProcess(cmd string, tier llm.ModelTier) {
	eth.mu.Lock()
	defer eth.mu.Unlock()

	detected := eth.llmDetector.DetectCommand(cmd)
	eth.activeProcess = &ActiveProcessInfo{
		Provider:    detected.Provider,
		CommandType: detected.Type,
		RawCommand:  cmd,
		StartTime:   time.Now(),
		Tier:        tier,
	}
	log.Printf("[Executive] Active process set: %s (%s)", detected.Provider, tier)
}

// ClearActiveProcess clears the active process tracking.
func (eth *ExecutiveTriggerHandler) ClearActiveProcess() {
	eth.mu.Lock()
	defer eth.mu.Unlock()
	eth.activeProcess = nil
	log.Printf("[Executive] Active process cleared")
}

// GetActiveProcess returns the current active process info (thread-safe copy).
func (eth *ExecutiveTriggerHandler) GetActiveProcess() *ActiveProcessInfo {
	eth.mu.Lock()
	defer eth.mu.Unlock()
	if eth.activeProcess == nil {
		return nil
	}
	// Return a copy to avoid races
	copy := *eth.activeProcess
	return &copy
}

// detectExpectedTierFromCommand determines which tier a command belongs to.
func (eth *ExecutiveTriggerHandler) detectExpectedTierFromCommand(cmd string) llm.ModelTier {
	config := eth.configLoader.GetConfig()
	cmdLower := strings.ToLower(cmd)

	// Check Tier 3 first (highest priority commands like claude, aider with opus)
	tier3Cmd := strings.ToLower(config.Tier3.Command)
	if strings.Contains(cmdLower, "claude") || strings.Contains(cmdLower, "opus") ||
		strings.Contains(tier3Cmd, "claude") || strings.Contains(tier3Cmd, "opus") {
		// Check if the command matches tier3 pattern
		if matchesCommandPattern(cmd, config.Tier3.Command) {
			return llm.TierOpus
		}
	}

	// Check Tier 1 (quick tasks like copilot suggest)
	if matchesCommandPattern(cmd, config.Tier1.Command) {
		return llm.TierHaiku
	}

	// Check Tier 2 (balanced tasks)
	if matchesCommandPattern(cmd, config.Tier2.Command) {
		return llm.TierSonnet
	}

	// Default: try to infer from command name
	if strings.Contains(cmdLower, "copilot") {
		return llm.TierHaiku
	}
	if strings.Contains(cmdLower, "aider") {
		return llm.TierSonnet
	}
	if strings.Contains(cmdLower, "claude") {
		return llm.TierOpus
	}

	return llm.TierSonnet // Default to middle tier
}

// matchesCommandPattern checks if a command matches a config pattern (ignoring placeholders).
func matchesCommandPattern(cmd, pattern string) bool {
	// Remove placeholders from pattern
	basePattern := strings.Split(pattern, "{")[0]
	basePattern = strings.TrimSpace(basePattern)

	// Extract base command from both
	cmdParts := strings.Fields(cmd)
	patternParts := strings.Fields(basePattern)

	if len(cmdParts) == 0 || len(patternParts) == 0 {
		return false
	}

	// Compare the command base (e.g., "gh copilot" or "claude")
	minLen := len(patternParts)
	if len(cmdParts) < minLen {
		minLen = len(cmdParts)
	}

	for i := 0; i < minLen; i++ {
		if strings.ToLower(cmdParts[i]) != strings.ToLower(patternParts[i]) {
			return false
		}
	}
	return true
}

// checkSystemProcesses checks what LLM processes are running on the system.
func (eth *ExecutiveTriggerHandler) checkSystemProcesses() *ActiveProcessInfo {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		// Use tasklist to find running processes
		cmd = exec.Command("tasklist", "/FO", "CSV", "/NH")
	} else {
		// Use ps for Unix-like systems
		cmd = exec.Command("ps", "aux")
	}

	output, err := cmd.Output()
	if err != nil {
		log.Printf("[Executive] Failed to check processes: %v", err)
		return nil
	}

	outputStr := string(output)

	// Check for known LLM processes
	llmProcesses := []struct {
		name     string
		provider llm.Provider
		tier     llm.ModelTier
	}{
		{"claude", llm.ProviderClaude, llm.TierOpus},
		{"aider", llm.ProviderAider, llm.TierSonnet},
		{"gh.exe", llm.ProviderGitHubCopilot, llm.TierHaiku}, // Windows
		{"gh", llm.ProviderGitHubCopilot, llm.TierHaiku},     // Unix
		{"copilot", llm.ProviderGitHubCopilot, llm.TierHaiku},
	}

	for _, proc := range llmProcesses {
		if strings.Contains(strings.ToLower(outputStr), proc.name) {
			return &ActiveProcessInfo{
				Provider:  proc.provider,
				Tier:      proc.tier,
				StartTime: time.Now(),
			}
		}
	}

	return nil
}

// RoutingResult contains the result of routing a prompt.
type RoutingResult struct {
	Tier            llm.ModelTier
	ToolName        string
	Command         string
	Prompt          string
	HasVision       bool
	VisionCtx       string
	// Task 1 & 4: Active execution tracking
	ActiveProcess   *ActiveProcessInfo // What's currently running (if any)
	TierMismatch    bool               // True if routed tier != active process tier
	MismatchAction  TierMismatchAction // What action was taken
	ActuallyRunning string             // What is ACTUALLY running (for badge sync)
	// v3.5.3: SLM analysis data (replaces heuristics)
	TaskType        string  // debug, explain, refactor, generate, simple
	Complexity      int     // 1-10 complexity score
	Confidence      float64 // SLM confidence in analysis
	UsedSLM         bool    // True if SLM was used, false if heuristic fallback
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
// Task 1 & 2: Now includes active process detection and tier mismatch handling.
// v3.5.3: Uses real SLM analysis instead of heuristic pattern matching.
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

	// v3.5.3: Use SLM for real task analysis if available
	var tier llm.ModelTier
	var taskType string
	var complexity int
	var confidence float64
	var usedSLM bool

	if eth.slmProvider != nil && eth.slmProvider.IsAvailable() {
		// Use real SLM analysis
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		slmInput := slm.PromptContext{
			Prompt: cleanPrompt,
		}

		if result, err := eth.slmProvider.Analyze(ctx, slmInput); err == nil && result != nil {
			taskType = string(result.TaskType)
			complexity = result.Complexity
			confidence = result.Confidence
			usedSLM = true

			// Map SLM task type + complexity to model tier
			tier = eth.mapSLMToTier(result)
			log.Printf("[Executive] SLM analysis: task=%s, complexity=%d, confidence=%.2f -> tier=%s",
				taskType, complexity, confidence, tier)
		} else {
			log.Printf("[Executive] SLM analysis failed: %v, falling back to heuristics", err)
			tier = eth.classifier.ClassifyTask(cleanPrompt)
			taskType = eth.inferTaskTypeFromTier(tier)
		}
	} else {
		// Fallback to heuristic classifier
		tier = eth.classifier.ClassifyTask(cleanPrompt)
		taskType = eth.inferTaskTypeFromTier(tier)
		log.Printf("[Executive] Using heuristic fallback: tier=%s, taskType=%s", tier, taskType)
	}

	// 2. Build execution context
	execCtx := &llm.ExecutionContext{
		Prompt:    cleanPrompt,
		Cwd:       getCwd(),
		GitBranch: getGitBranch(),
	}

	// 3. Add Vision context if available
	result := &RoutingResult{
		Tier:       tier,
		Prompt:     cleanPrompt,
		TaskType:   taskType,
		Complexity: complexity,
		Confidence: confidence,
		UsedSLM:    usedSLM,
	}

	config := eth.configLoader.GetConfig()
	if config.IncludeVision && eth.visionParser != nil {
		if summary := eth.visionParser.GetLastImageSummary(); summary != "" {
			execCtx.VisionSummary = summary
			// Prepend to prompt for context
			execCtx.Prompt = fmt.Sprintf("[Context: Forge Vision saw %s] %s", summary, cleanPrompt)
			result.HasVision = true
			result.VisionCtx = summary
			log.Printf("[Executive] Added Vision context: %s", truncate(summary, 50))
		}
	}

	// 4. Build the command for the routed tier
	command := eth.configLoader.BuildCommand(tier, execCtx)
	tierConfig := eth.configLoader.GetTierConfig(tier)

	result.ToolName = tierConfig.Name
	result.Command = command

	// 5. Task 1: Check what's currently running and detect tier mismatch
	result.ActiveProcess = eth.activeProcess
	if eth.activeProcess != nil {
		// Compare routed tier with active process tier
		if eth.activeProcess.Tier != tier {
			result.TierMismatch = true
			result.MismatchAction = TierMismatchLaunch // Default: launch the correct command
			log.Printf("[Executive] TIER MISMATCH: Active=%s, Routed=%s", eth.activeProcess.Tier, tier)
		} else {
			result.TierMismatch = false
			result.ActuallyRunning = tierConfig.Name
			log.Printf("[Executive] Tier match: both %s", tier)
		}
	} else {
		// No active process - will launch the routed command
		result.MismatchAction = TierMismatchLaunch
		log.Printf("[Executive] No active process - will launch %s", tierConfig.Name)
	}

	// 6. Task 4: Set what will actually be running
	result.ActuallyRunning = tierConfig.Name

	log.Printf("[Executive] Routed to %s: %s (task=%s, complexity=%d)",
		tierConfig.Name, truncate(command, 80), taskType, complexity)

	return result
}

// mapSLMToTier converts SLM analysis to a model tier.
// This uses the task type and complexity to determine the best tier.
func (eth *ExecutiveTriggerHandler) mapSLMToTier(result *slm.AnalysisResult) llm.ModelTier {
	// High complexity (7+) or architecture tasks -> Opus
	if result.Complexity >= 7 {
		return llm.TierOpus
	}

	// Task-type based routing
	switch result.TaskType {
	case slm.TaskDebug:
		if result.Complexity >= 5 {
			return llm.TierSonnet // Complex debugging
		}
		return llm.TierHaiku // Simple debugging

	case slm.TaskRefactor:
		if result.Complexity >= 6 {
			return llm.TierOpus // Large refactoring
		}
		return llm.TierSonnet // Standard refactoring

	case slm.TaskGenerate:
		if result.Complexity >= 6 {
			return llm.TierOpus // Complex generation
		}
		return llm.TierSonnet // Standard generation

	case slm.TaskExplain:
		if result.Complexity >= 5 {
			return llm.TierSonnet // Deep explanation
		}
		return llm.TierHaiku // Simple explanation

	case slm.TaskSimple:
		return llm.TierHaiku // Quick tasks

	default:
		// Unknown task type - use complexity
		if result.Complexity >= 5 {
			return llm.TierSonnet
		}
		return llm.TierHaiku
	}
}

// inferTaskTypeFromTier provides a best-guess task type when SLM is unavailable.
func (eth *ExecutiveTriggerHandler) inferTaskTypeFromTier(tier llm.ModelTier) string {
	switch tier {
	case llm.TierOpus:
		return "architecture"
	case llm.TierSonnet:
		return "refactor"
	case llm.TierHaiku:
		return "simple"
	default:
		return "unknown"
	}
}

// RoutingNotification contains all info for the frontend notification.
type RoutingNotification struct {
	Tier            string  `json:"tier"`
	ToolName        string  `json:"toolName"`
	Prompt          string  `json:"prompt"`
	TierMismatch    bool    `json:"tierMismatch"`
	ActuallyRunning string  `json:"actuallyRunning"`
	PreviousTier    string  `json:"previousTier,omitempty"`
	Action          string  `json:"action"` // "launch", "warn", "skip"
	// v3.5.3: SLM analysis data
	TaskType        string  `json:"taskType,omitempty"`   // debug, explain, refactor, generate, simple
	Complexity      int     `json:"complexity,omitempty"` // 1-10 complexity score
	Confidence      float64 `json:"confidence,omitempty"` // SLM confidence
	UsedSLM         bool    `json:"usedSLM"`              // True if real SLM, false if heuristic
}

// Handle executes the routing for a prompt, writing the command to the PTY.
// Task 1 & 2: Now implements active execution switching.
func (eth *ExecutiveTriggerHandler) Handle(
	prompt string,
	session *TerminalSession,
	notifyFn func(tier string, toolName string, prompt string),
) error {
	return eth.HandleWithExtendedNotify(prompt, session, func(n *RoutingNotification) {
		if notifyFn != nil {
			notifyFn(n.Tier, n.ToolName, n.Prompt)
		}
	})
}

// HandleWithExtendedNotify executes routing with extended notification including mismatch info.
// Task 1: Active Execution Switching - launch the correct tier command.
// Task 2: Automatic Model Selection - type the entire command into PTY.
func (eth *ExecutiveTriggerHandler) HandleWithExtendedNotify(
	prompt string,
	session *TerminalSession,
	notifyFn func(n *RoutingNotification),
) error {
	result := eth.Route(prompt)
	if result == nil {
		return fmt.Errorf("routing failed or cooldown active")
	}

	// Build extended notification with SLM data
	notification := &RoutingNotification{
		Tier:            string(result.Tier),
		ToolName:        result.ToolName,
		Prompt:          result.Prompt,
		TierMismatch:    result.TierMismatch,
		ActuallyRunning: result.ActuallyRunning,
		Action:          string(result.MismatchAction),
		// v3.5.3: Include SLM analysis data
		TaskType:        result.TaskType,
		Complexity:      result.Complexity,
		Confidence:      result.Confidence,
		UsedSLM:         result.UsedSLM,
	}

	// If there was a previous process, include its tier
	if result.ActiveProcess != nil {
		notification.PreviousTier = string(result.ActiveProcess.Tier)
	}

	// Task 1: Handle tier mismatch
	if result.TierMismatch && result.ActiveProcess != nil {
		log.Printf("[Executive] Tier mismatch detected: was %s, routing to %s",
			result.ActiveProcess.Tier, result.Tier)

		switch result.MismatchAction {
		case TierMismatchLaunch:
			// Launch the correct tier command - this is the default behavior
			log.Printf("[Executive] Launching correct tier command: %s", result.Command)
			// Fall through to execute

		case TierMismatchWarn:
			// Warn user but don't execute
			notification.Action = "warn"
			if notifyFn != nil {
				notifyFn(notification)
			}
			return fmt.Errorf("tier mismatch: active=%s, routed=%s (warning mode)",
				result.ActiveProcess.Tier, result.Tier)

		case TierMismatchSkip:
			// Skip and use current process - just send the prompt
			notification.Action = "skip"
			notification.ActuallyRunning = string(result.ActiveProcess.Tier)
			if notifyFn != nil {
				notifyFn(notification)
			}
			// Just send the prompt to the existing process
			if _, err := session.Write([]byte(result.Prompt + "\r")); err != nil {
				return fmt.Errorf("failed to write prompt to PTY: %w", err)
			}
			return nil
		}
	}

	// Notify frontend of routing with extended info
	if notifyFn != nil {
		notifyFn(notification)
	}

	// Task 2: Automatic Model Selection
	// Execute the FULL command in PTY - the router builds the complete command
	// including the CLI tool and all arguments
	log.Printf("[Executive] Executing: %s", result.Command)
	if _, err := session.Write([]byte(result.Command + "\r")); err != nil {
		return fmt.Errorf("failed to write command to PTY: %w", err)
	}

	// Update active process tracking
	eth.SetActiveProcess(result.Command, result.Tier)

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
