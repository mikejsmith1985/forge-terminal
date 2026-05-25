// discovery.go implements MCP server discovery for external clients.
//
// When the Forge MCP server starts, it writes a discovery file to
// ~/.forge/mcp-server.json containing the server's URL, auth token location,
// and available tools. External tools (like Copilot CLI) can read this file
// to auto-discover and connect to Forge's MCP server.
package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// DiscoveryConfig represents the MCP server discovery information written to disk.
type DiscoveryConfig struct {
	Version   string                     `json:"version"`
	MCPServer DiscoveryMCPServer         `json:"mcp_server"`
	Discovery DiscoveryMetadata          `json:"discovery"`
}

// DiscoveryMCPServer holds the connection details for the MCP server.
type DiscoveryMCPServer struct {
	Type             string   `json:"type"`
	URL              string   `json:"url"`
	ProtocolVersion  string   `json:"protocol_version"`
	Auth             AuthInfo `json:"auth"`
	AvailableTools   []string `json:"available_tools"`
}

// AuthInfo specifies how to authenticate with the MCP server.
type AuthInfo struct {
	Type      string `json:"type"`
	TokenFile string `json:"token_file"`
}

// DiscoveryMetadata provides context about when/where the server is running.
type DiscoveryMetadata struct {
	Timestamp   string `json:"timestamp"`
	ForgeVersion string `json:"forge_version"`
	ProcessID   int    `json:"process_id"`
}

// WriteDiscoveryFile writes the MCP server discovery config to ~/.forge/mcp-server.json.
// This enables external tools (Copilot CLI) to auto-discover and connect to Forge's MCP server.
func WriteDiscoveryFile(forgeVersion string, mcpServerURL string, availableTools []string) error {
	homeDir, homeErr := os.UserHomeDir()
	if homeErr != nil {
		return fmt.Errorf("unable to determine home directory: %w", homeErr)
	}

	forgeDir := filepath.Join(homeDir, ".forge")
	if err := os.MkdirAll(forgeDir, 0o700); err != nil {
		return fmt.Errorf("unable to create ~/.forge directory: %w", err)
	}

	discoveryPath := filepath.Join(forgeDir, "mcp-server.json")

	discovery := DiscoveryConfig{
		Version: "1.0",
		MCPServer: DiscoveryMCPServer{
			Type:            "http",
			URL:             mcpServerURL,
			ProtocolVersion: mcpProtocolVersion,
			Auth: AuthInfo{
				Type:      "bearer",
				TokenFile: filepath.Join(homeDir, ".forge", "mcp-token"),
			},
			AvailableTools: availableTools,
		},
		Discovery: DiscoveryMetadata{
			Timestamp:    time.Now().UTC().Format(time.RFC3339),
			ForgeVersion: forgeVersion,
			ProcessID:    os.Getpid(),
		},
	}

	jsonData, marshalErr := json.MarshalIndent(discovery, "", "  ")
	if marshalErr != nil {
		return fmt.Errorf("unable to marshal discovery config: %w", marshalErr)
	}

	if writeErr := os.WriteFile(discoveryPath, jsonData, 0o600); writeErr != nil {
		return fmt.Errorf("unable to write %s: %w", discoveryPath, writeErr)
	}

	return nil
}

// GetDiscoveryFilePath returns the path to the MCP server discovery file.
// This is a helper for testing and external tools.
func GetDiscoveryFilePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".forge", "mcp-server.json"), nil
}

// ReadDiscoveryFile reads and parses the MCP server discovery config from disk.
// Used by external tools to discover Forge's MCP server.
func ReadDiscoveryFile() (*DiscoveryConfig, error) {
	path, pathErr := GetDiscoveryFilePath()
	if pathErr != nil {
		return nil, pathErr
	}

	data, readErr := os.ReadFile(path)
	if readErr != nil {
		return nil, fmt.Errorf("unable to read discovery file: %w", readErr)
	}

	var config DiscoveryConfig
	if unmarshalErr := json.Unmarshal(data, &config); unmarshalErr != nil {
		return nil, fmt.Errorf("unable to parse discovery file: %w", unmarshalErr)
	}

	return &config, nil
}
