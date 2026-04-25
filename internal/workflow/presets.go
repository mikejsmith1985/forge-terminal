package workflow

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// presetsDirectoryOverride allows tests to redirect preset storage to a temporary directory.
// When empty, presetsDirectory() uses the default ~/.forge/workflow-presets/ location.
var presetsDirectoryOverride string

// presetsDirectory returns the path to the user's preset storage directory.
// Presets are stored in ~/.forge/workflow-presets/ to be portable across projects.
func presetsDirectory() (string, error) {
	if presetsDirectoryOverride != "" {
		return presetsDirectoryOverride, nil
	}
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("finding home directory: %w", err)
	}
	return filepath.Join(homeDirectory, ".forge", "workflow-presets"), nil
}

// presetFilePath returns the full file path for a preset by ID.
func presetFilePath(presetID string) (string, error) {
	presetDir, err := presetsDirectory()
	if err != nil {
		return "", err
	}
	// Sanitize the ID to prevent directory traversal
	sanitizedID := sanitizePresetID(presetID)
	return filepath.Join(presetDir, sanitizedID+".json"), nil
}

// sanitizePresetID removes unsafe characters from a preset ID,
// allowing only alphanumeric, hyphens, and underscores.
func sanitizePresetID(presetID string) string {
	var sanitizedBuilder strings.Builder
	for _, character := range presetID {
		if (character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '-' || character == '_' {
			sanitizedBuilder.WriteRune(character)
		}
	}
	sanitized := sanitizedBuilder.String()
	if sanitized == "" {
		sanitized = "unnamed-preset"
	}
	return sanitized
}

// BuiltInPresets returns the two default presets that ship with Forge.
// These are read-only and cannot be deleted or modified by the user.
func BuiltInPresets() []WorkflowPreset {
	enterpriseStandardConfig := DefaultConfig()

	leanStartupConfig := WorkflowConfig{
		QualityMode: QualityFast,
		EnabledModules: []ModuleID{
			ModuleCopilotInstructions,
			ModuleCodeQuality,
			ModuleTestingStandards,
			ModuleDocumentation,
			ModuleWorkflowEnforcer,
		},
		ConflictStrategy: ConflictSkip,

		PRReviewSettings: PRReviewConfig{
			Strategy:         PRReviewManual,
			AutoTrigger:      false,
			RequireChangelog: false,
			AgentStrictness:  "lenient",
			AgentFocusAreas:  []string{"naming", "complexity"},
		},
	}

	return []WorkflowPreset{
		{
			ID:          "enterprise-standard",
			Name:        "Enterprise Standard",
			Description: "Full Forge Workflow: all modules enabled, BEST quality mode, multi-agent review, all enforcement layers.",
			BuiltIn:     true,
			Config:      enterpriseStandardConfig,
			CreatedAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			ID:          "lean-startup",
			Name:        "Lean Startup",
			Description: "Core quality modules with FAST mode. Essentials only — code quality, testing, documentation, and enforcer.",
			BuiltIn:     true,
			Config:      leanStartupConfig,
			CreatedAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
			UpdatedAt:   time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		},
	}
}

// ListPresets returns all available presets: built-in presets first, then user presets.
func ListPresets() ([]WorkflowPreset, error) {
	allPresets := BuiltInPresets()

	userPresets, err := listUserPresets()
	if err != nil {
		log.Printf("[Workflow] Warning: could not load user presets: %v", err)
		// Return built-ins even if user presets fail to load
		return allPresets, nil
	}

	allPresets = append(allPresets, userPresets...)
	return allPresets, nil
}

// GetPreset retrieves a single preset by ID.
func GetPreset(presetID string) (*WorkflowPreset, error) {
	// Check built-in presets first
	for _, builtInPreset := range BuiltInPresets() {
		if builtInPreset.ID == presetID {
			return &builtInPreset, nil
		}
	}

	// Load from user presets
	presetPath, err := presetFilePath(presetID)
	if err != nil {
		return nil, err
	}

	fileContent, err := os.ReadFile(presetPath)
	if err != nil {
		return nil, fmt.Errorf("preset not found: %s", presetID)
	}

	var preset WorkflowPreset
	if err := json.Unmarshal(fileContent, &preset); err != nil {
		return nil, fmt.Errorf("parsing preset %s: %w", presetID, err)
	}

	return &preset, nil
}

// SavePreset creates a new user preset or updates an existing one.
// Built-in presets cannot be overwritten.
func SavePreset(preset WorkflowPreset) error {
	// Prevent overwriting built-in presets
	for _, builtInPreset := range BuiltInPresets() {
		if builtInPreset.ID == preset.ID {
			return fmt.Errorf("cannot overwrite built-in preset: %s", preset.ID)
		}
	}

	preset.BuiltIn = false
	if preset.CreatedAt.IsZero() {
		preset.CreatedAt = time.Now()
	}
	preset.UpdatedAt = time.Now()

	// Ensure the presets directory exists
	presetDir, err := presetsDirectory()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(presetDir, 0o755); err != nil {
		return fmt.Errorf("creating preset directory: %w", err)
	}

	presetPath, err := presetFilePath(preset.ID)
	if err != nil {
		return err
	}

	serializedPreset, err := json.MarshalIndent(preset, "", "  ")
	if err != nil {
		return fmt.Errorf("serializing preset: %w", err)
	}

	if err := os.WriteFile(presetPath, serializedPreset, 0o644); err != nil {
		return fmt.Errorf("writing preset file: %w", err)
	}

	log.Printf("[Workflow] Saved preset: %s (%s)", preset.Name, presetPath)
	return nil
}

// DeletePreset removes a user preset. Built-in presets cannot be deleted.
func DeletePreset(presetID string) error {
	for _, builtInPreset := range BuiltInPresets() {
		if builtInPreset.ID == presetID {
			return fmt.Errorf("cannot delete built-in preset: %s", presetID)
		}
	}

	presetPath, err := presetFilePath(presetID)
	if err != nil {
		return err
	}

	if err := os.Remove(presetPath); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("preset not found: %s", presetID)
		}
		return fmt.Errorf("deleting preset: %w", err)
	}

	log.Printf("[Workflow] Deleted preset: %s", presetID)
	return nil
}

// listUserPresets reads all .json files from the presets directory.
func listUserPresets() ([]WorkflowPreset, error) {
	presetDir, err := presetsDirectory()
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(presetDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // No user presets yet
		}
		return nil, fmt.Errorf("reading presets directory: %w", err)
	}

	var userPresets []WorkflowPreset
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		fullPath := filepath.Join(presetDir, entry.Name())
		fileContent, err := os.ReadFile(fullPath)
		if err != nil {
			log.Printf("[Workflow] Warning: skipping unreadable preset: %s", entry.Name())
			continue
		}

		var preset WorkflowPreset
		if err := json.Unmarshal(fileContent, &preset); err != nil {
			log.Printf("[Workflow] Warning: skipping malformed preset: %s", entry.Name())
			continue
		}

		preset.BuiltIn = false // User presets are never built-in
		userPresets = append(userPresets, preset)
	}

	return userPresets, nil
}
