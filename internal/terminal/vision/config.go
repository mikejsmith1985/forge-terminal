package vision

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config represents Vision feature configuration.
type Config struct {
	Enabled     bool           `json:"enabled"`
	Detectors   DetectorConfig `json:"detectors"`
	JSONMinSize int            `json:"jsonMinSize"`
	AutoDismiss bool           `json:"autoDismiss"`
}

// DetectorConfig controls which detectors are active.
type DetectorConfig struct {
	JSON          bool `json:"json"`
	CompilerError bool `json:"compiler_error"`
	StackTrace    bool `json:"stack_trace"`
	Git           bool `json:"git"`
	FilePath      bool `json:"filepath"`
}

// ConfigManager handles Vision configuration persistence.
type ConfigManager struct {
	mu         sync.RWMutex
	config     *Config
	configPath string
}

// DefaultConfig returns the default Vision configuration.
func DefaultConfig() *Config {
	return &Config{
		Enabled: false, // Opt-in via Dev Mode
		Detectors: DetectorConfig{
			JSON:          true,
			CompilerError: true,
			StackTrace:    true,
			Git:           true,
			FilePath:      true,
		},
		JSONMinSize: 30, // Ignore trivial JSON
		AutoDismiss: true,
	}
}

// NewConfigManager creates a new config manager.
func NewConfigManager(forgeDir string) *ConfigManager {
	configPath := filepath.Join(forgeDir, "vision-config.json")
	return &ConfigManager{
		config:     DefaultConfig(),
		configPath: configPath,
	}
}

// Load reads configuration from disk.
func (cm *ConfigManager) Load() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file, use defaults
			return nil
		}
		return err
	}

	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return err
	}

	cm.config = &config
	return nil
}

// Save writes configuration to disk.
func (cm *ConfigManager) Save() error {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	// Ensure directory exists
	dir := filepath.Dir(cm.configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(cm.configPath, data, 0644)
}

// Get returns a copy of the current configuration.
func (cm *ConfigManager) Get() Config {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return *cm.config
}

// Update updates the configuration and saves to disk.
func (cm *ConfigManager) Update(config Config) error {
	cm.mu.Lock()
	cm.config = &config
	cm.mu.Unlock()

	return cm.Save()
}

// ApplyToRegistry applies config to detector registry.
func (cm *ConfigManager) ApplyToRegistry(registry *Registry) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	detectorMap := map[string]bool{
		"json":           cm.config.Detectors.JSON,
		"compiler_error": cm.config.Detectors.CompilerError,
		"stack_trace":    cm.config.Detectors.StackTrace,
		"git":            cm.config.Detectors.Git,
		"filepath":       cm.config.Detectors.FilePath,
	}

	for name, enabled := range detectorMap {
		if detector := registry.GetDetector(name); detector != nil {
			detector.SetEnabled(enabled)
		}
	}
}

// GetJSONMinSize returns the JSON minimum size threshold.
func (cm *ConfigManager) GetJSONMinSize() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.config.JSONMinSize
}
