// inject_test.go — unit tests for Forge Vault injection script generation.
//
// Core injection script tests also exist in vault_test.go. This file adds
// focused unit tests for edge cases in the script builder helpers.
package vault

import (
	"os"
	"runtime"
	"strings"
	"testing"
)

// TestBuildInjectionScriptFileExists verifies that BuildInjectionScript
// creates a temp file with appropriate extension and non-empty content.
func TestBuildInjectionScriptFileExists(t *testing.T) {
	envVars := map[string]string{
		"TEST_KEY": "test_value",
	}

	scriptPath, buildErr := BuildInjectionScript(envVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	// File must exist
	info, statErr := os.Stat(scriptPath)
	if statErr != nil {
		t.Fatalf("script file not found at %s: %v", scriptPath, statErr)
	}
	if info.Size() == 0 {
		t.Error("injection script must not be empty")
	}

	// Extension must match platform
	if runtime.GOOS == "windows" {
		if !strings.HasSuffix(scriptPath, ".ps1") {
			t.Errorf("Windows script should have .ps1 extension, got: %s", scriptPath)
		}
	} else {
		if !strings.HasSuffix(scriptPath, ".sh") {
			t.Errorf("Unix script should have .sh extension, got: %s", scriptPath)
		}
	}
}

// TestBuildInjectionScriptContainsEnvVar verifies the generated script contains
// the env var assignment (but we don't test for the raw value in this file —
// that test is in vault_test.go since it has access to the platform helpers).
func TestBuildInjectionScriptContainsEnvVar(t *testing.T) {
	envVars := map[string]string{
		"MY_SECRET_KEY": "super_secret",
	}

	scriptPath, buildErr := BuildInjectionScript(envVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	content, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("failed to read script: %v", readErr)
	}
	scriptContent := string(content)

	// The env var name must appear in the script
	if !strings.Contains(scriptContent, "MY_SECRET_KEY") {
		t.Errorf("script must contain env var name 'MY_SECRET_KEY'")
	}
}

// TestBuildInjectionScriptContainsSelfDelete verifies the script includes
// a self-delete command at the end (platform-appropriate).
func TestBuildInjectionScriptContainsSelfDelete(t *testing.T) {
	envVars := map[string]string{"CLEANUP_TEST": "val"}

	scriptPath, buildErr := BuildInjectionScript(envVars)
	if buildErr != nil {
		t.Fatalf("BuildInjectionScript failed: %v", buildErr)
	}
	defer os.Remove(scriptPath)

	content, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		t.Fatalf("failed to read script: %v", readErr)
	}
	scriptContent := string(content)

	// Platform-specific delete command
	if runtime.GOOS == "windows" {
		if !strings.Contains(scriptContent, "Remove-Item") && !strings.Contains(scriptContent, "del ") {
			t.Error("Windows PS1 script must contain self-delete command (Remove-Item)")
		}
	} else {
		if !strings.Contains(scriptContent, "rm ") && !strings.Contains(scriptContent, "rm -f") {
			t.Error("Unix script must contain self-delete command (rm)")
		}
	}
}
