package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// TabState represents the persisted state of a terminal tab
type TabState struct {
	ID               string      `json:"id"`
	Title            string      `json:"title"`
	ShellConfig      ShellConfig `json:"shellConfig"`
	ColorTheme       string      `json:"colorTheme"`
	Mode             string      `json:"mode"`
	AutoRespond      bool        `json:"autoRespond"`
	AMEnabled        bool        `json:"amEnabled"`
	CurrentDirectory string      `json:"currentDirectory,omitempty"` // Current working directory
}

// ShellConfig represents the shell configuration for a tab
type ShellConfig struct {
	ShellType   string `json:"shellType"`
	WSLDistro   string `json:"wslDistro,omitempty"`
	WSLHomePath string `json:"wslHomePath,omitempty"`
}

// Session represents the persisted session state
type Session struct {
	Tabs        []TabState `json:"tabs"`
	ActiveTabID string     `json:"activeTabId"`
}

// DefaultSession returns a default session with one tab
var DefaultSession = Session{
	Tabs:        []TabState{},
	ActiveTabID: "",
}

// GetSessionsPath returns the path to the sessions JSON file
func GetSessionsPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "sessions.json"), nil
}

// LoadSession loads session from the JSON file
func LoadSession() (*Session, error) {
	path, err := GetSessionsPath()
	if err != nil {
		return nil, err
	}

	// Return empty session if file doesn't exist
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return &DefaultSession, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var session Session
	if err := json.Unmarshal(data, &session); err != nil {
		// Return empty session on parse error
		return &DefaultSession, nil
	}

	return &session, nil
}

// SaveSession saves session to the JSON file
func SaveSession(session *Session) error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return err
	}

	path, err := GetSessionsPath()
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}
