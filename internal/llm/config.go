// Package llm provides configuration loading for smart model routing.
package llm

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/BurntSushi/toml"
)

// stripANSI removes ANSI escape codes from text.
// This is a local copy to avoid import cycle with internal/am.
func stripANSI(input []byte) string {
	// Fast path: check if there are any escape sequences
	hasEscape := false
	for _, b := range input {
		if b == 0x1b {
			hasEscape = true
			break
		}
	}
	if !hasEscape {
		return string(input)
	}

	// Use regex for simple stripping
	ansiPattern := regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[PX^_][^\x1b]*\x1b\\|\x1b.`)
	return ansiPattern.ReplaceAllString(string(input), "")
}

// TierConfig represents a single tier's configuration.
type TierConfig struct {
	Name    string // Human-readable name (e.g., "Copilot", "Aider")
	Command string // Command template with placeholders
}

// RoutingConfig holds the complete routing configuration.
type RoutingConfig struct {
	Tier1 TierConfig
	Tier2 TierConfig
	Tier3 TierConfig

	// Context settings
	IncludeCwd       bool
	IncludeGitBranch bool
	IncludeVision    bool
}

// forgeTomlSchema matches the TOML file structure.
type forgeTomlSchema struct {
	Routing struct {
		Tier1Name string `toml:"tier1_name"`
		Tier1Cmd  string `toml:"tier1_cmd"`
		Tier2Name string `toml:"tier2_name"`
		Tier2Cmd  string `toml:"tier2_cmd"`
		Tier3Name string `toml:"tier3_name"`
		Tier3Cmd  string `toml:"tier3_cmd"`
	} `toml:"routing"`
	Context struct {
		IncludeCwd       bool `toml:"include_cwd"`
		IncludeGitBranch bool `toml:"include_git_branch"`
		IncludeVision    bool `toml:"include_vision"`
	} `toml:"context"`
}

// ConfigLoader manages the forge.toml configuration.
type ConfigLoader struct {
	mu       sync.RWMutex
	config   *RoutingConfig
	filePath string
	loaded   bool
}

// DefaultConfig returns sensible defaults when forge.toml is missing.
// Task 3: Default fallback commands as specified:
// - Tier 1 (Haiku): gh copilot suggest "{prompt}"
// - Tier 2 (Sonnet): gh copilot suggest "{prompt}"
// - Tier 3 (Opus): claude "{prompt}" --model opus
func DefaultConfig() *RoutingConfig {
	return &RoutingConfig{
		Tier1: TierConfig{
			Name:    "Copilot",
			Command: `gh copilot suggest "{prompt}"`,
		},
		Tier2: TierConfig{
			Name:    "Copilot",
			Command: `gh copilot suggest "{prompt}"`,
		},
		Tier3: TierConfig{
			Name:    "Claude",
			Command: `claude "{prompt}" --model opus`,
		},
		IncludeCwd:       true,
		IncludeGitBranch: true,
		IncludeVision:    true,
	}
}

// NewConfigLoader creates a new config loader.
func NewConfigLoader() *ConfigLoader {
	return &ConfigLoader{
		config: DefaultConfig(),
	}
}

// LoadFromFile loads configuration from a forge.toml file.
func (cl *ConfigLoader) LoadFromFile(filePath string) error {
	cl.mu.Lock()
	defer cl.mu.Unlock()

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[Config] forge.toml not found at %s, using defaults", filePath)
			cl.config = DefaultConfig()
			cl.loaded = true
			return nil
		}
		return fmt.Errorf("failed to read forge.toml: %w", err)
	}

	var schema forgeTomlSchema
	if err := toml.Unmarshal(data, &schema); err != nil {
		return fmt.Errorf("failed to parse forge.toml: %w", err)
	}

	cl.config = &RoutingConfig{
		Tier1: TierConfig{
			Name:    schema.Routing.Tier1Name,
			Command: schema.Routing.Tier1Cmd,
		},
		Tier2: TierConfig{
			Name:    schema.Routing.Tier2Name,
			Command: schema.Routing.Tier2Cmd,
		},
		Tier3: TierConfig{
			Name:    schema.Routing.Tier3Name,
			Command: schema.Routing.Tier3Cmd,
		},
		IncludeCwd:       schema.Context.IncludeCwd,
		IncludeGitBranch: schema.Context.IncludeGitBranch,
		IncludeVision:    schema.Context.IncludeVision,
	}

	cl.filePath = filePath
	cl.loaded = true
	log.Printf("[Config] Loaded routing config from %s", filePath)
	return nil
}

// GetConfig returns the current configuration.
func (cl *ConfigLoader) GetConfig() *RoutingConfig {
	cl.mu.RLock()
	defer cl.mu.RUnlock()
	if cl.config == nil {
		return DefaultConfig()
	}
	return cl.config
}

// GetTierConfig returns the configuration for a specific tier.
func (cl *ConfigLoader) GetTierConfig(tier ModelTier) TierConfig {
	config := cl.GetConfig()
	switch tier {
	case TierHaiku:
		return config.Tier1
	case TierSonnet:
		return config.Tier2
	case TierOpus:
		return config.Tier3
	default:
		return config.Tier2 // Default to Tier 2
	}
}

// ExecutionContext provides context for command building.
type ExecutionContext struct {
	Prompt        string // User's prompt (text after "?")
	Cwd           string // Current working directory
	GitBranch     string // Current git branch
	VisionSummary string // Recent Forge Vision summary
	FocusedFile   string // Currently focused file
}

// BuildCommand constructs the final command by replacing placeholders.
func (cl *ConfigLoader) BuildCommand(tier ModelTier, ctx *ExecutionContext) string {
	tierConfig := cl.GetTierConfig(tier)
	cmd := tierConfig.Command

	// Clean the prompt using local stripANSI
	cleanPrompt := stripANSI([]byte(ctx.Prompt))

	// Escape special characters for shell safety
	cleanPrompt = escapeForShell(cleanPrompt)

	// Replace placeholders
	cmd = strings.ReplaceAll(cmd, "{prompt}", cleanPrompt)
	cmd = strings.ReplaceAll(cmd, "{cwd}", ctx.Cwd)
	cmd = strings.ReplaceAll(cmd, "{branch}", ctx.GitBranch)
	cmd = strings.ReplaceAll(cmd, "{vision}", ctx.VisionSummary)
	cmd = strings.ReplaceAll(cmd, "{file}", ctx.FocusedFile)

	return cmd
}

// escapeForShell escapes special characters for safe shell command injection.
func escapeForShell(s string) string {
	// Escape backslashes first
	s = strings.ReplaceAll(s, "\\", "\\\\")
	// Escape double quotes
	s = strings.ReplaceAll(s, "\"", "\\\"")
	// Escape backticks
	s = strings.ReplaceAll(s, "`", "\\`")
	// Escape dollar signs (prevent variable expansion)
	s = strings.ReplaceAll(s, "$", "\\$")
	// Escape exclamation marks (bash history expansion)
	s = strings.ReplaceAll(s, "!", "\\!")
	return s
}

// Global config loader instance
var globalConfigLoader = NewConfigLoader()
var globalConfigOnce sync.Once

// LoadConfig loads the global configuration from forge.toml.
func LoadConfig(repoRoot string) error {
	var loadErr error
	globalConfigOnce.Do(func() {
		filePath := filepath.Join(repoRoot, "forge.toml")
		loadErr = globalConfigLoader.LoadFromFile(filePath)
	})
	return loadErr
}

// GetGlobalConfig returns the global configuration.
func GetGlobalConfig() *RoutingConfig {
	return globalConfigLoader.GetConfig()
}

// GetGlobalConfigLoader returns the global config loader instance.
func GetGlobalConfigLoader() *ConfigLoader {
	return globalConfigLoader
}

// BuildRoutedCommand builds a command for the given tier and context.
func BuildRoutedCommand(tier ModelTier, ctx *ExecutionContext) string {
	return globalConfigLoader.BuildCommand(tier, ctx)
}
