package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/mikejsmith1985/forge-terminal/internal/commands"
)

// TabDefaultConfig represents theme defaults for individual tabs (1-20)
type TabDefaultConfig struct {
	Theme string `json:"theme"` // Color theme name (molten, ocean, etc.)
	Mode  string `json:"mode"`  // Light or dark mode
}

// TabDefaults represents the per-tab and global theme configuration
type TabDefaults struct {
	// Per-tab explicit defaults (keys: "1" through "20")
	PerTab map[string]TabDefaultConfig `json:"perTab"`

	// Global preset: 'auto-cycle', 'auto-cycle-dark', 'auto-cycle-light', or specific theme
	GlobalPreset string `json:"globalPreset"`

	// Split terminal/ribbon themes
	SplitThemes   bool             `json:"splitThemes"`
	TerminalTheme TabDefaultConfig `json:"terminalTheme"`
	ControlRibbon TabDefaultConfig `json:"controlRibbon"`

	// NOTE: tab naming is no longer configurable. Labels are the project-root
	// name, fixed at tab creation (see frontend/src/utils/tabLabel.js). The
	// former NamingStrategy/NamingPrefix/NamingRootFolder fields were removed.
}

// getTabDefaultsPath returns path to tab defaults config file
func getTabDefaultsPath() (string, error) {
	configDir, err := commands.GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "tab-defaults.json"), nil
}

// defaultTabDefaults returns a fresh TabDefaults with all fields set to sensible defaults.
func defaultTabDefaults() *TabDefaults {
	return &TabDefaults{
		PerTab:       make(map[string]TabDefaultConfig),
		GlobalPreset: "auto-cycle",
		SplitThemes:  false,
		TerminalTheme: TabDefaultConfig{
			Theme: "molten",
			Mode:  "dark",
		},
		ControlRibbon: TabDefaultConfig{
			Theme: "molten",
			Mode:  "dark",
		},
	}
}

// loadTabDefaults loads tab defaults from config file
func loadTabDefaults() (*TabDefaults, error) {
	path, err := getTabDefaultsPath()
	if err != nil {
		return nil, err
	}
	
	// Return defaults if file doesn't exist
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return defaultTabDefaults(), nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		// If we can't read the file, return defaults instead of error
		log.Printf("[Tab Defaults] Warning: Could not read file, returning defaults: %v", err)
		return defaultTabDefaults(), nil
	}

	var defaults TabDefaults
	if err := json.Unmarshal(data, &defaults); err != nil {
		// If JSON is corrupted, return defaults
		log.Printf("[Tab Defaults] Warning: Could not parse JSON, returning defaults: %v", err)
		return defaultTabDefaults(), nil
	}
	
	// Ensure perTab map exists
	if defaults.PerTab == nil {
		defaults.PerTab = make(map[string]TabDefaultConfig)
	}
	
	// Ensure terminal/ribbon themes have defaults
	if defaults.TerminalTheme.Theme == "" {
		defaults.TerminalTheme = TabDefaultConfig{Theme: "molten", Mode: "dark"}
	}
	if defaults.ControlRibbon.Theme == "" {
		defaults.ControlRibbon = TabDefaultConfig{Theme: "molten", Mode: "dark"}
	}
	if defaults.GlobalPreset == "" {
		defaults.GlobalPreset = "auto-cycle"
	}

	return &defaults, nil
}

// saveTabDefaults saves tab defaults to config file
func saveTabDefaults(defaults *TabDefaults) error {
	configDir, err := commands.GetConfigDir()
	if err != nil {
		return err
	}
	
	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}
	
	data, err := json.MarshalIndent(defaults, "", "  ")
	if err != nil {
		return err
	}
	
	path, err := getTabDefaultsPath()
	if err != nil {
		return err
	}
	
	return os.WriteFile(path, data, 0600)
}

// handleGetTabDefaults handles GET /api/tab-defaults
func handleGetTabDefaults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	defaults, err := loadTabDefaults()
	if err != nil {
		log.Printf("[Tab Defaults] Error loading: %v", err)
		defaults = defaultTabDefaults()
	}
	
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(defaults); err != nil {
		log.Printf("[Tab Defaults] Error encoding JSON: %v", err)
	}
}

// handleSaveTabDefaults handles POST /api/tab-defaults
func handleSaveTabDefaults(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var defaults TabDefaults
	if err := json.NewDecoder(r.Body).Decode(&defaults); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	
	if err := saveTabDefaults(&defaults); err != nil {
		log.Printf("[Tab Defaults] Error saving: %v", err)
		http.Error(w, "Failed to save tab defaults", http.StatusInternalServerError)
		return
	}
	
	log.Printf("[Tab Defaults] Saved: globalPreset=%s, splitThemes=%v, perTabCount=%d",
		defaults.GlobalPreset, defaults.SplitThemes, len(defaults.PerTab))
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "saved"})
}

// registerTabDefaultsHandlers registers tab defaults API endpoints
func registerTabDefaultsHandlers() {
	http.HandleFunc("/api/tab-defaults", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetTabDefaults(w, r)
		case http.MethodPost:
			handleSaveTabDefaults(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	
	log.Printf("[Tab Defaults] Registered API endpoints")
}
