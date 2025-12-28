package provider

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// =============================================================================
// GitHub Copilot Provider
// =============================================================================

// CopilotProvider implements the Provider interface for GitHub Copilot CLI.
type CopilotProvider struct{}

// NewCopilotProvider creates a new Copilot provider instance.
func NewCopilotProvider() *CopilotProvider {
	return &CopilotProvider{}
}

func (p *CopilotProvider) Name() string {
	return "copilot"
}

func (p *CopilotProvider) DisplayName() string {
	return "GitHub Copilot"
}

func (p *CopilotProvider) GetBinaryName() string {
	return "copilot"
}

func (p *CopilotProvider) IsInstalled() bool {
	return checkBinaryExists("copilot")
}

func (p *CopilotProvider) IsAuthenticated(ctx context.Context) (bool, error) {
	// The standalone copilot CLI handles auth internally via GitHub
	// If we can run copilot --version, we're good
	_, err := execCommand(ctx, "copilot", "--version")
	if err != nil {
		return false, nil
	}
	return true, nil
}

func (p *CopilotProvider) ListModels(ctx context.Context) ([]ModelInfo, error) {
	// Try to parse models from copilot --help output
	output, err := execCommand(ctx, "copilot", "--help")
	if err == nil && len(output) > 0 {
		models := parseCopilotHelpModels(output)
		if len(models) > 0 {
			return models, nil
		}
	}

	// Fallback to known Copilot CLI models (as of late 2025)
	return []ModelInfo{
		{ID: "claude-sonnet-4.5", Name: "Claude Sonnet 4.5", Description: "Latest Claude Sonnet"},
		{ID: "claude-haiku-4.5", Name: "Claude Haiku 4.5", Description: "Fast Claude model"},
		{ID: "claude-opus-4.5", Name: "Claude Opus 4.5", Description: "Most capable Claude"},
		{ID: "claude-sonnet-4", Name: "Claude Sonnet 4", Description: "Claude Sonnet 4"},
		{ID: "gpt-5.1-codex-max", Name: "GPT-5.1 Codex Max", Description: "Most capable coding model"},
		{ID: "gpt-5.1-codex", Name: "GPT-5.1 Codex", Description: "Advanced coding model"},
		{ID: "gpt-5.2", Name: "GPT-5.2", Description: "Latest GPT model"},
		{ID: "gpt-5.1", Name: "GPT-5.1", Description: "GPT 5.1"},
		{ID: "gpt-5", Name: "GPT-5", Description: "GPT 5"},
		{ID: "gpt-5.1-codex-mini", Name: "GPT-5.1 Codex Mini", Description: "Fast coding model"},
		{ID: "gpt-5-mini", Name: "GPT-5 Mini", Description: "Fast GPT model"},
		{ID: "gpt-4.1", Name: "GPT-4.1", Description: "GPT 4.1"},
		{ID: "gemini-3-pro-preview", Name: "Gemini 3 Pro Preview", Description: "Google's Gemini model"},
	}, nil
}

// parseCopilotHelpModels extracts model choices from copilot --help output
func parseCopilotHelpModels(output string) []ModelInfo {
	var models []ModelInfo

	// The --model choices can span multiple lines, so we need to find the full choices string
	// Look for "choices:" and then collect everything until we find the closing ")"

	choicesIdx := strings.Index(output, "choices:")
	if choicesIdx == -1 {
		return models
	}

	// Start after "choices:"
	remaining := output[choicesIdx+8:]

	// Find the closing paren for the choices
	endIdx := strings.Index(remaining, ")")
	if endIdx != -1 {
		remaining = remaining[:endIdx]
	}

	// Clean up the string: remove newlines and extra whitespace
	remaining = strings.ReplaceAll(remaining, "\n", " ")
	remaining = strings.ReplaceAll(remaining, "\r", "")

	// Parse quoted model names
	parts := strings.Split(remaining, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		part = strings.Trim(part, "\"'")
		part = strings.TrimSpace(part) // Trim again after removing quotes
		if part != "" && !strings.HasPrefix(part, "-") {
			models = append(models, ModelInfo{
				ID:   part,
				Name: formatModelName(part),
			})
		}
	}

	return models
}

// formatModelName converts model ID to display name
func formatModelName(id string) string {
	// Simple formatting: replace dashes with spaces and title case
	name := strings.ReplaceAll(id, "-", " ")
	words := strings.Fields(name)
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(word[:1]) + word[1:]
		}
	}
	return strings.Join(words, " ")
}

func (p *CopilotProvider) GetAuthInstructions() string {
	return `To authenticate with GitHub Copilot CLI:

1. Install the GitHub Copilot CLI:
   npm install -g @anthropic-ai/copilot-cli
   
   Or download from: https://githubnext.com/projects/copilot-cli

2. The CLI will prompt for authentication on first use

3. Ensure you have an active GitHub Copilot subscription`
}

// =============================================================================
// Claude (Anthropic) Provider
// =============================================================================

// ClaudeProvider implements the Provider interface for Claude CLI.
type ClaudeProvider struct{}

// NewClaudeProvider creates a new Claude provider instance.
func NewClaudeProvider() *ClaudeProvider {
	return &ClaudeProvider{}
}

func (p *ClaudeProvider) Name() string {
	return "claude"
}

func (p *ClaudeProvider) DisplayName() string {
	return "Claude (Anthropic)"
}

func (p *ClaudeProvider) GetBinaryName() string {
	return "claude"
}

func (p *ClaudeProvider) IsInstalled() bool {
	return checkBinaryExists("claude")
}

func (p *ClaudeProvider) IsAuthenticated(ctx context.Context) (bool, error) {
	// Check for web login credentials first (most common case)
	if p.hasWebLoginConfigured() {
		return true, nil
	}

	// Check for API key configuration
	if p.hasAPIKeyConfigured() {
		return true, nil
	}

	return false, nil
}

// hasWebLoginConfigured checks for Claude Code web login credentials
func (p *ClaudeProvider) hasWebLoginConfigured() bool {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return false
	}

	// Check ~/.claude/.credentials.json for claudeAiOauth
	credentialsPath := filepath.Join(homeDir, ".claude", ".credentials.json")
	if data, err := os.ReadFile(credentialsPath); err == nil {
		var creds map[string]interface{}
		if json.Unmarshal(data, &creds) == nil {
			// Check for claudeAiOauth with valid accessToken
			if oauth, ok := creds["claudeAiOauth"].(map[string]interface{}); ok {
				if token, ok := oauth["accessToken"].(string); ok && token != "" {
					return true
				}
			}
		}
	}

	return false
}

func (p *ClaudeProvider) hasAPIKeyConfigured() bool {
	// Check for API key in common locations
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return false
	}

	// Check ~/.anthropic/config.json
	configPath := filepath.Join(homeDir, ".anthropic", "config.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var config map[string]interface{}
		if json.Unmarshal(data, &config) == nil {
			if _, ok := config["api_key"]; ok {
				return true
			}
		}
	}

	// Check environment variable
	if os.Getenv("ANTHROPIC_API_KEY") != "" {
		return true
	}

	return false
}

func (p *ClaudeProvider) ListModels(ctx context.Context) ([]ModelInfo, error) {
	// Try to get models from claude CLI
	output, err := execCommand(ctx, "claude", "models")
	if err == nil && len(output) > 0 {
		models := parseModelList(output)
		if len(models) > 0 {
			return models, nil
		}
	}

	// Also try 'claude model list' format
	output, err = execCommand(ctx, "claude", "model", "list")
	if err == nil && len(output) > 0 {
		models := parseModelList(output)
		if len(models) > 0 {
			return models, nil
		}
	}

	// Fallback to known Claude models
	return []ModelInfo{
		{ID: "claude-sonnet-4-20250514", Name: "Claude Sonnet 4", Description: "Best balance of speed and capability"},
		{ID: "claude-opus-4-20250514", Name: "Claude Opus 4", Description: "Most capable model"},
		{ID: "claude-3-5-sonnet-20241022", Name: "Claude 3.5 Sonnet", Description: "Previous generation Sonnet"},
		{ID: "claude-3-5-haiku-20241022", Name: "Claude 3.5 Haiku", Description: "Fast and efficient"},
		{ID: "claude-3-opus-20240229", Name: "Claude 3 Opus", Description: "Previous generation Opus"},
	}, nil
}

func (p *ClaudeProvider) GetAuthInstructions() string {
	return `To authenticate with Claude:

1. Install Claude CLI:
   npm install -g @anthropic-ai/claude-cli

   Or download from: https://claude.ai/cli

2. Authenticate using one of these methods:

   Option A - Browser login:
   claude auth login

   Option B - API Key:
   Set ANTHROPIC_API_KEY environment variable

   Or create ~/.anthropic/config.json:
   {
     "api_key": "sk-ant-..."
   }

3. Verify authentication:
   claude auth status`
}

// =============================================================================
// Helper Functions
// =============================================================================

// parseModelList attempts to parse a model list from CLI output.
func parseModelList(output string) []ModelInfo {
	var models []ModelInfo
	lines := strings.Split(output, "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "-") {
			continue
		}

		// Try to extract model ID from common formats
		parts := strings.Fields(line)
		if len(parts) >= 1 {
			modelID := parts[0]
			// Skip header-like lines
			if strings.ToLower(modelID) == "model" || strings.ToLower(modelID) == "name" {
				continue
			}

			// Clean up model ID
			modelID = strings.Trim(modelID, "│|")
			modelID = strings.TrimSpace(modelID)

			if modelID != "" && !strings.Contains(modelID, "---") {
				model := ModelInfo{ID: modelID, Name: modelID}
				if len(parts) >= 2 {
					model.Description = strings.Join(parts[1:], " ")
				}
				models = append(models, model)
			}
		}
	}

	return models
}

// SetAPIKey attempts to configure an API key for a provider.
func SetAPIKey(providerName, apiKey string) error {
	switch strings.ToLower(providerName) {
	case "claude":
		return setClaudeAPIKey(apiKey)
	case "copilot":
		// Copilot uses GitHub OAuth, not API keys
		return nil
	default:
		return nil
	}
}

func setClaudeAPIKey(apiKey string) error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	configDir := filepath.Join(homeDir, ".anthropic")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	configPath := filepath.Join(configDir, "config.json")

	// Read existing config if present
	var config map[string]interface{}
	if data, err := os.ReadFile(configPath); err == nil {
		json.Unmarshal(data, &config)
	}
	if config == nil {
		config = make(map[string]interface{})
	}

	config["api_key"] = apiKey

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0600)
}

// hideWindow sets the SysProcAttr to hide the console window on Windows.
func hideWindow(cmd *exec.Cmd) {
	configureCmdForPlatform(cmd)
}
