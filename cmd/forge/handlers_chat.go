package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/llm"
	"github.com/mikejsmith1985/forge-terminal/internal/terminal/vision"
)

type ChatRequest struct {
	Message      string   `json:"message"`
	TabID        string   `json:"tabId"`
	ContextFiles []string `json:"contextFiles"` // File paths for @ mentions (v3.3.6)
	Model        string   `json:"model,omitempty"` // Optional: preferred model (v3.4.0)
}

// Regex to match [@filepath] tokens in user message
var contextFileTokenRegex = regexp.MustCompile(`\[@([^\]]+)\]`)

func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.Message) == "" {
		http.Error(w, "Message required", http.StatusBadRequest)
		return
	}

	tabID := req.TabID
	if tabID == "" || tabID == "default" {
		tabID = "main"
	}

	// Parse [@file] tokens from message and add to contextFiles
	tokenFiles := parseContextTokens(req.Message)
	allContextFiles := append(req.ContextFiles, tokenFiles...)

	// Remove [@file] tokens from user message so LLM sees clean question
	cleanMessage := stripContextTokens(req.Message)

	log.Printf("[Chat API] Processing message: %s (tabId: %s, contextFiles: %d)", cleanMessage, tabID, len(allContextFiles))

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")

	// Build file context from @ mentions (v3.3.6 Deep Context)
	fileContext := buildFileContext(allContextFiles)

	terminalContext, err := buildChatContext(tabID)
	if err != nil {
		log.Printf("[Chat API] Warning: failed to build context: %v", err)
		terminalContext = ""
	}

	// Combine file context with terminal context
	if fileContext != "" {
		if terminalContext != "" {
			terminalContext = fileContext + "\n\n---\n\n" + terminalContext
		} else {
			terminalContext = fileContext
		}
	}

	fullPrompt := buildChatPrompt(cleanMessage, terminalContext)

	log.Printf("[Chat API] Full prompt length: %d chars", len(fullPrompt))

	// v3.12.3: Simple model selection - use Sonnet tier (balanced) for all chat requests
	tier := llm.ClassifyTask(cleanMessage)
	log.Printf("[Chat API] Model tier: %s", tier)

	// Get model from router config based on tier
	modelName := getModelForTier(tier)

	// Use explicit model request if provided
	if req.Model != "" {
		modelName = req.Model
	}

	// Set the routing header so frontend can display which model was used
	w.Header().Set("X-Forge-Routed-To", modelName)
	log.Printf("[Chat API] Routed to model: %s", modelName)

	provider := "auto"
	if os.Getenv("LLM_PROVIDER") != "" {
		provider = os.Getenv("LLM_PROVIDER")
	}

	if err := streamChatResponse(w, fullPrompt, provider, tabID, modelName); err != nil {
		log.Printf("[Chat API] Stream error: %v", err)
	}
}

// parseContextTokens extracts file paths from [@filepath] tokens in message
func parseContextTokens(message string) []string {
	matches := contextFileTokenRegex.FindAllStringSubmatch(message, -1)
	var files []string
	for _, match := range matches {
		if len(match) > 1 {
			files = append(files, match[1])
		}
	}
	return files
}

// stripContextTokens removes [@filepath] tokens from the message
func stripContextTokens(message string) string {
	return contextFileTokenRegex.ReplaceAllString(message, "")
}

// buildFileContext reads files from @ mentions and formats them for the prompt (v3.3.6)
func buildFileContext(filePaths []string) string {
	if len(filePaths) == 0 {
		return ""
	}

	var contextParts []string
	seen := make(map[string]bool) // Deduplicate files

	for _, filePath := range filePaths {
		// Clean the path (remove @ prefix if present)
		cleanPath := strings.TrimPrefix(filePath, "@")
		cleanPath = strings.TrimSpace(cleanPath)

		if cleanPath == "" || seen[cleanPath] {
			continue
		}
		seen[cleanPath] = true

		log.Printf("[Chat API] Reading context file: %s", cleanPath)

		// Read the file
		content, err := os.ReadFile(cleanPath)
		if err != nil {
			// File not found or error - include error message
			log.Printf("[Chat API] Failed to read file %s: %v", cleanPath, err)
			contextParts = append(contextParts, fmt.Sprintf("CONTEXT FILE: %s\n<error>File not found: %v</error>", cleanPath, err))
			continue
		}

		// Limit file size to prevent huge prompts (max 100KB per file)
		maxSize := 100 * 1024
		fileContent := string(content)
		if len(fileContent) > maxSize {
			fileContent = fileContent[:maxSize] + "\n... [truncated - file too large]"
		}

		contextParts = append(contextParts, fmt.Sprintf("CONTEXT FILE: %s\n<code>\n%s\n</code>", cleanPath, fileContent))
		log.Printf("[Chat API] Added context file: %s (%d bytes)", cleanPath, len(fileContent))
	}

	if len(contextParts) == 0 {
		return ""
	}

	return strings.Join(contextParts, "\n\n")
}

func buildChatContext(tabID string) (string, error) {
	// v3.12.3: AM system removed - context building simplified
	// Chat now works without terminal snapshot context
	return "", nil
}

func formatInsightSummary(insight *vision.Insight) string {
	if insight == nil {
		return ""
	}

	var buf bytes.Buffer
	buf.WriteString(fmt.Sprintf("Last activity at: %s\n", insight.Timestamp.Format("2006-01-02 15:04:05")))

	if insight.Message != "" {
		buf.WriteString(fmt.Sprintf("Type: %s - %s\n", insight.Type, insight.Message))
	}

	return buf.String()
}

func buildChatPrompt(userMessage string, context string) string {
	var prompt strings.Builder

	prompt.WriteString("You are Forge Terminal's AI assistant. You help developers with terminal commands, debugging, and code questions.\n\n")

	if context != "" {
		prompt.WriteString("=== CONTEXT ===\n")
		prompt.WriteString(context)
		prompt.WriteString("\n\n=== USER MESSAGE ===\n")
	}

	prompt.WriteString(userMessage)

	return prompt.String()
}

// streamChatResponse sends the prompt to an LLM and streams the response.
// modelName is the SLM-selected model to use (e.g., "claude-sonnet-4", "gpt-5-mini")
func streamChatResponse(w http.ResponseWriter, prompt string, provider string, tabID string, modelName string) error {
	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("streaming not supported")
	}

	if os.Getenv("SKIP_LLM") == "true" {
		mockResponse := "This is a mock response. To enable real LLM responses, ensure copilot or claude CLI is installed."
		_, err := io.WriteString(w, mockResponse)
		if err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	// v3.5.0: Try CLI tools first, then fall back to direct API
	// This uses the same auth as terminal commands
	// v3.5.3: Pass model selection from SLM analysis to CLI
	
	// Determine which CLI to use based on model name
	isCopilotModel := strings.HasPrefix(modelName, "gpt") || 
		strings.HasPrefix(modelName, "claude-") || 
		strings.HasPrefix(modelName, "gemini") ||
		modelName == "" // Default to copilot
	
	isClaudeModel := strings.HasPrefix(modelName, "claude-") || 
		modelName == "opus" || modelName == "sonnet" || modelName == "haiku"
	
	// Try Copilot CLI first if it's a copilot-supported model
	if isCopilotModel {
		if cliResponse, err := streamViaCopilotCLI(prompt, tabID, modelName); err == nil {
			_, err = io.WriteString(w, cliResponse)
			if err != nil {
				return err
			}
			flusher.Flush()
			return nil
		}
	}
	
	// Try Claude CLI for Claude models or as fallback
	if isClaudeModel {
		// Map full model names to Claude CLI aliases
		claudeModel := modelName
		if strings.Contains(modelName, "opus") {
			claudeModel = "opus"
		} else if strings.Contains(modelName, "sonnet") {
			claudeModel = "sonnet"
		} else if strings.Contains(modelName, "haiku") {
			claudeModel = "haiku"
		}
		
		if cliResponse, err := streamViaClaudeCLI(prompt, claudeModel); err == nil {
			_, err = io.WriteString(w, cliResponse)
			if err != nil {
				return err
			}
			flusher.Flush()
			return nil
		}
	}
	
	// Fallback: try copilot without model specification
	if cliResponse, err := streamViaCopilotCLI(prompt, tabID, ""); err == nil {
		_, err = io.WriteString(w, cliResponse)
		if err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	// Fall back to direct API if ANTHROPIC_API_KEY is set
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey != "" {
		return streamViaDirectAPI(w, prompt, apiKey, flusher)
	}

	// No provider available
	fallbackMsg := `No AI provider available. Please ensure one of the following:

1. GitHub Copilot CLI is installed and authenticated:
   - Install: npm install -g @githubnext/github-copilot-cli
   - Auth: copilot (follow prompts)

2. Claude CLI is installed and authenticated:
   - Install: pip install claude-cli
   - Auth: claude login

3. Or set ANTHROPIC_API_KEY environment variable for direct API access.`

	_, err := io.WriteString(w, fallbackMsg)
	if err != nil {
		return err
	}
	flusher.Flush()
	return nil
}

// tabIDToSessionUUID converts a Forge tabID to a valid UUID for copilot CLI
// This ensures each Forge tab gets its own isolated Copilot session
func tabIDToSessionUUID(tabID string) string {
	// Hash the tabID to get consistent bytes
	hash := sha256.Sum256([]byte("forge-terminal:" + tabID))
	// Format as UUID v4-like string (8-4-4-4-12)
	hexStr := hex.EncodeToString(hash[:16])
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hexStr[0:8], hexStr[8:12], hexStr[12:16], hexStr[16:20], hexStr[20:32])
}

// streamViaCopilotCLI executes prompt through the copilot CLI
// Uses tabID to create isolated sessions and prevent context pollution
// modelName specifies which model to use (e.g., "claude-sonnet-4", "gpt-5-mini")
// Uses --allow-all-tools to enable non-interactive execution from Chat view
func streamViaCopilotCLI(prompt string, tabID string, modelName string) (string, error) {
	// Check if copilot is available
	if _, err := exec.LookPath("copilot"); err != nil {
		return "", fmt.Errorf("copilot not found: %w", err)
	}

	// Generate a unique session ID from the tabID to isolate conversations
	sessionID := tabIDToSessionUUID(tabID)

	// Use copilot -p for non-interactive prompt mode
	// -s (silent) outputs only the response without stats
	// --session-id isolates this tab's conversation history
	// --no-custom-instructions prevents loading AGENTS.md from other projects
	// --model specifies the SLM-selected model
	// --allow-all-tools enables automatic tool execution without prompts (critical for Chat view)
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second) // Extended timeout for tool execution
	defer cancel()

	// Build args - include --model only if specified
	// --allow-all-tools is required for non-interactive mode when tools may be called
	args := []string{
		"-p", prompt,
		"-s",
		"--no-color",
		"--session-id", sessionID,
		"--no-custom-instructions",
		"--allow-all-tools", // Auto-approve tool calls - no human interaction needed
	}
	if modelName != "" {
		args = append([]string{"--model", modelName}, args...)
	}
	
	cmd := exec.CommandContext(ctx, "copilot", args...)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")
	
	log.Printf("[Chat CLI] Using copilot with model=%s, session-id=%s, allow-all-tools=true for tab=%s", modelName, sessionID, tabID)
	
	output, err := cmd.Output()
	if err != nil {
		log.Printf("[Chat CLI] copilot command failed: %v", err)
		return "", err
	}

	// Clean the output
	result := cleanCLIOutput(string(output))
	if result == "" {
		return "", fmt.Errorf("empty response from copilot")
	}

	log.Printf("[Chat CLI] Got response from copilot (%d chars)", len(result))
	return result, nil
}

// streamViaClaudeCLI executes prompt through the claude CLI
// modelName is the model alias (e.g., "opus", "sonnet", "haiku")
// Uses --permission-mode acceptEdits to enable non-interactive execution from Chat view
func streamViaClaudeCLI(prompt string, modelName string) (string, error) {
	// Check if claude is available
	if _, err := exec.LookPath("claude"); err != nil {
		return "", fmt.Errorf("claude not found: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second) // Extended for tool execution
	defer cancel()

	// claude -p (print) outputs response and exits
	// --output-format text ensures plain text output
	// --model specifies the model alias (sonnet, opus, haiku)
	// --permission-mode acceptEdits auto-approves file edits without prompting
	args := []string{
		"-p", prompt,
		"--output-format", "text",
		"--permission-mode", "acceptEdits", // Auto-approve edits - no human interaction needed
	}
	if modelName != "" {
		args = append(args, "--model", modelName)
	}
	
	cmd := exec.CommandContext(ctx, "claude", args...)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")
	
	log.Printf("[Chat CLI] Using claude with model=%s, permission-mode=acceptEdits", modelName)
	
	output, err := cmd.Output()
	if err != nil {
		log.Printf("[Chat CLI] claude command failed: %v", err)
		return "", err
	}

	result := cleanCLIOutput(string(output))
	if result == "" {
		return "", fmt.Errorf("empty response from claude")
	}

	log.Printf("[Chat CLI] Got response from claude (%d chars)", len(result))
	return result, nil
}

// cleanCLIOutput removes ANSI codes and cleans CLI output
func cleanCLIOutput(output string) string {
	// Remove ANSI escape codes
	ansiRegex := regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)
	clean := ansiRegex.ReplaceAllString(output, "")
	
	// Remove carriage returns
	clean = strings.ReplaceAll(clean, "\r", "")
	
	// Trim whitespace
	clean = strings.TrimSpace(clean)
	
	return clean
}

// streamViaDirectAPI calls Claude API directly (fallback)
func streamViaDirectAPI(w http.ResponseWriter, prompt string, apiKey string, flusher http.Flusher) error {
	claudeURL := "https://api.anthropic.com/v1/messages"
	payload := map[string]interface{}{
		"model":      "claude-3-5-sonnet-20241022",
		"max_tokens": 2048,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": prompt,
			},
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", claudeURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fallback := fmt.Sprintf("Error calling Claude API: %v", err)
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("[Chat API] Claude API error: %d - %s", resp.StatusCode, string(bodyBytes))
		fallback := fmt.Sprintf("Claude API error: %d", resp.StatusCode)
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("[Chat API] Failed to decode Claude response: %v", err)
		fallback := "Failed to parse Claude response"
		_, _ = io.WriteString(w, fallback)
		flusher.Flush()
		return nil
	}

	if len(result.Content) == 0 {
		_, _ = io.WriteString(w, "No response from Claude")
		flusher.Flush()
		return nil
	}

	responseText := result.Content[0].Text
	_, err = io.WriteString(w, responseText)
	if err != nil {
		return err
	}

	flusher.Flush()
	return nil
}

// getModelForTier maps LLM tier to model name from router config
// v3.5.3: Returns models compatible with Copilot CLI --model flag
func getModelForTier(tier llm.ModelTier) string {
	config := GetRouterConfig()

	switch tier {
	case llm.TierHaiku:
		if t, ok := config.Tiers["tier1"]; ok && t.Model != "" && t.Model != "auto" {
			return t.Model
		}
		return "gpt-5-mini" // Fast, cheap - Copilot CLI compatible
	case llm.TierSonnet:
		if t, ok := config.Tiers["tier2"]; ok && t.Model != "" && t.Model != "auto" {
			return t.Model
		}
		return "claude-sonnet-4" // Balanced - Copilot CLI compatible
	case llm.TierOpus:
		if t, ok := config.Tiers["tier3"]; ok && t.Model != "" && t.Model != "auto" {
			return t.Model
		}
		return "claude-opus-4.5" // Powerful - Copilot CLI compatible
	default:
		return GetActiveModel()
	}
}
