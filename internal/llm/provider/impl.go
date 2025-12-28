package provider

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
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
	// Check for standalone copilot CLI first, then gh
	if checkBinaryExists("copilot") {
		return "copilot"
	}
	return "gh"
}

func (p *CopilotProvider) IsInstalled() bool {
	// Check for standalone copilot CLI
	if checkBinaryExists("copilot") {
		return true
	}

	// Check for gh CLI with copilot extension
	if checkBinaryExists("gh") {
		// Verify copilot extension is installed
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		output, err := execCommand(ctx, "gh", "extension", "list")
		if err == nil && strings.Contains(output, "copilot") {
			return true
		}

		// Also try the copilot subcommand directly
		_, err = execCommand(ctx, "gh", "copilot", "--help")
		return err == nil
	}

	return false
}

func (p *CopilotProvider) IsAuthenticated(ctx context.Context) (bool, error) {
	// First check if gh is authenticated
	output, err := execCommand(ctx, "gh", "auth", "status")
	if err != nil {
		// Check if it's an auth error vs command error
		if strings.Contains(output, "not logged in") ||
			strings.Contains(output, "no oauth token") {
			return false, nil
		}
		return false, err
	}

	// gh auth status returns 0 if authenticated
	return strings.Contains(output, "Logged in") ||
		strings.Contains(output, "logged in"), nil
}

func (p *CopilotProvider) ListModels(ctx context.Context) ([]ModelInfo, error) {
	// Try to get models from copilot CLI
	output, err := execCommand(ctx, "gh", "copilot", "model", "list")
	if err == nil && len(output) > 0 {
		// Parse model list output
		models := parseModelList(output)
		if len(models) > 0 {
			return models, nil
		}
	}

	// Fallback to known Copilot-supported models
	return []ModelInfo{
		{ID: "gpt-4o", Name: "GPT-4o", Description: "Latest GPT-4 optimized model"},
		{ID: "gpt-4o-mini", Name: "GPT-4o Mini", Description: "Fast and efficient"},
		{ID: "claude-3.5-sonnet", Name: "Claude 3.5 Sonnet", Description: "Anthropic's Sonnet model"},
		{ID: "o1-preview", Name: "o1-preview", Description: "OpenAI reasoning model"},
		{ID: "o1-mini", Name: "o1-mini", Description: "Fast reasoning model"},
	}, nil
}

func (p *CopilotProvider) GetAuthInstructions() string {
	return `To authenticate with GitHub Copilot:

1. Install the GitHub CLI if not installed:
   - Windows: winget install GitHub.cli
   - macOS: brew install gh
   - Linux: See https://cli.github.com

2. Install the Copilot extension:
   gh extension install github/gh-copilot

3. Authenticate with GitHub:
   gh auth login

4. Ensure you have an active Copilot subscription`
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
	// Try claude auth status
	output, err := execCommand(ctx, "claude", "auth", "status")
	if err != nil {
		// Check for specific auth error messages
		if strings.Contains(output, "not authenticated") ||
			strings.Contains(output, "not logged in") ||
			strings.Contains(output, "no api key") ||
			strings.Contains(output, "API key") {
			return false, nil
		}

		// Also check if there's a config file with API key
		if p.hasAPIKeyConfigured() {
			return true, nil
		}

		return false, err
	}

	return strings.Contains(output, "authenticated") ||
		strings.Contains(output, "logged in") ||
		strings.Contains(output, "Logged in"), nil
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
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow: true,
		}
	}
}
