// forge-debug is a standalone diagnostic tool for troubleshooting Forge Terminal
// connection failures. It runs pre-launch environment checks, launches fterm.exe
// as a child process, monitors HTTP/WebSocket connectivity, and generates a full
// diagnostic report that can be copied to clipboard for developer analysis.
package main

import (
	"fmt"
	"os"
	"strconv"

	tea "github.com/charmbracelet/bubbletea"
)

// DebugToolVersion is the version of the forge-debug diagnostic tool.
const DebugToolVersion = "1.0.0"

// DefaultForgePort is the default port used by fterm.exe when no config is found.
const DefaultForgePort = 9119

func main() {
	port := detectConfiguredPort()

	fmt.Printf("Forge Terminal Diagnostic Tool v%s\n", DebugToolVersion)
	fmt.Printf("Target port: %d\n\n", port)

	model := createInitialModel(port)
	program := tea.NewProgram(model, tea.WithAltScreen())

	if _, runError := program.Run(); runError != nil {
		fmt.Fprintf(os.Stderr, "Error running diagnostic tool: %v\n", runError)
		os.Exit(1)
	}
}

// detectConfiguredPort reads the port from forge.toml in the current directory,
// or falls back to the FORGE_PORT environment variable, or the default port.
func detectConfiguredPort() int {
	// Check environment variable first (useful for testing)
	if envPort := os.Getenv("FORGE_PORT"); envPort != "" {
		if parsedPort, parseError := strconv.Atoi(envPort); parseError == nil && parsedPort > 0 {
			return parsedPort
		}
	}

	// Try to read forge.toml for port configuration
	configPort := readPortFromForgeToml()
	if configPort > 0 {
		return configPort
	}

	return DefaultForgePort
}

// readPortFromForgeToml attempts to extract the port from forge.toml using simple
// string parsing (avoids pulling in a full TOML library just for one field).
func readPortFromForgeToml() int {
	configData, readError := os.ReadFile("forge.toml")
	if readError != nil {
		return 0
	}

	// Simple line-by-line search for port = NNNN
	lines := splitLines(string(configData))
	for _, line := range lines {
		trimmedLine := trimWhitespace(line)
		if len(trimmedLine) >= 6 && trimmedLine[:4] == "port" {
			// Find the value after '='
			equalsIndex := indexOf(trimmedLine, '=')
			if equalsIndex > 0 {
				valueStr := trimWhitespace(trimmedLine[equalsIndex+1:])
				if parsedPort, parseError := strconv.Atoi(valueStr); parseError == nil && parsedPort > 0 {
					return parsedPort
				}
			}
		}
	}

	return 0
}

// splitLines splits a string into lines (handles both \n and \r\n).
func splitLines(text string) []string {
	var lines []string
	currentLine := ""
	for _, char := range text {
		if char == '\n' {
			lines = append(lines, currentLine)
			currentLine = ""
		} else if char == '\r' {
			continue
		} else {
			currentLine += string(char)
		}
	}
	if currentLine != "" {
		lines = append(lines, currentLine)
	}
	return lines
}

// trimWhitespace removes leading and trailing spaces/tabs from a string.
func trimWhitespace(text string) string {
	startIndex := 0
	for startIndex < len(text) && (text[startIndex] == ' ' || text[startIndex] == '\t') {
		startIndex++
	}
	endIndex := len(text)
	for endIndex > startIndex && (text[endIndex-1] == ' ' || text[endIndex-1] == '\t') {
		endIndex--
	}
	return text[startIndex:endIndex]
}

// indexOf returns the index of the first occurrence of a byte in a string, or -1.
func indexOf(text string, target byte) int {
	for i := 0; i < len(text); i++ {
		if text[i] == target {
			return i
		}
	}
	return -1
}
