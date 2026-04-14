// inject_test.go — Unit tests for the vault injection script builder.
//
// Verifies that BuildInjectionScript creates a valid script file containing
// the expected variable assignments, and that the file is cleaned up afterward.
package vault

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

// TestBuildInjectionScript_CreatesFile verifies that BuildInjectionScript
// writes a non-empty file to disk.
func TestBuildInjectionScript_CreatesFile(t *testing.T) {
	envVarsToInject := map[string]string{
		"OPENAI_API_KEY": "sk-test-value-123",
	}

	scriptPath, buildErr := BuildInjectionScript(envVarsToInject)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath) // Clean up after test

	if scriptPath == "" {
		t.Fatal("BuildInjectionScript returned an empty path")
	}

	fileInfo, statErr := os.Stat(scriptPath)
	if statErr != nil {
		t.Fatalf("script file does not exist at %q: %v", scriptPath, statErr)
	}
	if fileInfo.Size() == 0 {
		t.Error("script file exists but is empty")
	}
}

// TestBuildInjectionScript_ContainsVarAssignments verifies that the script
// contains assignment lines for all provided environment variables.
func TestBuildInjectionScript_ContainsVarAssignments(t *testing.T) {
	envVarsToInject := map[string]string{
		"GITHUB_TOKEN":    "ghp_token_value",
		"OPENAI_API_KEY":  "sk-openai-key",
	}

	scriptPath, buildErr := BuildInjectionScript(envVarsToInject)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	scriptContent, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("failed to read generated script: %v", readErr)
	}
	contentString := string(scriptContent)

	// Verify each env var name appears in the script.
	for envVarName := range envVarsToInject {
		if !strings.Contains(contentString, envVarName) {
			t.Errorf("script does not contain variable %q", envVarName)
		}
	}
}

// TestBuildInjectionScript_PlatformExtension verifies that the script
// has the correct file extension for the current platform.
func TestBuildInjectionScript_PlatformExtension(t *testing.T) {
	envVarsToInject := map[string]string{"TEST_VAR": "value"}

	scriptPath, buildErr := BuildInjectionScript(envVarsToInject)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	if runtime.GOOS == "windows" {
		if !strings.HasSuffix(scriptPath, ".ps1") {
			t.Errorf("on Windows, script should be .ps1 — got %q", scriptPath)
		}
	} else {
		if !strings.HasSuffix(scriptPath, ".sh") {
			t.Errorf("on Unix, script should be .sh — got %q", scriptPath)
		}
	}
}

// TestBuildInjectionScript_RejectsEmptyMap ensures BuildInjectionScript
// returns an error instead of creating a pointless empty script.
func TestBuildInjectionScript_RejectsEmptyMap(t *testing.T) {
	_, buildErr := BuildInjectionScript(map[string]string{})
	if buildErr == nil {
		t.Error("BuildInjectionScript should return an error for an empty env var map")
	}
}

// TestBuildInjectionScript_EscapesSingleQuotes verifies that single-quote
// characters in secret values are safely escaped in the generated script.
func TestBuildInjectionScript_EscapesSingleQuotes(t *testing.T) {
	envVarsToInject := map[string]string{
		"QUOTED_SECRET": "it's-a-secret",
	}

	scriptPath, buildErr := BuildInjectionScript(envVarsToInject)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	scriptContent, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("failed to read generated script: %v", readErr)
	}
	contentString := string(scriptContent)

	// The raw single-quote must not appear unescaped inside a single-quoted string.
	// On Windows: '' (doubled), on Unix: '"'"' (POSIX-escaped).
	if strings.Contains(contentString, "='it's-a-secret'") {
		t.Error("single quote in secret value was not escaped — shell injection risk")
	}
}
