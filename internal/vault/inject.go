// inject.go ΓÇö Manual secret injection into running PTY sessions.
//
// When a user clicks "Inject Now" for one or more vault entries, Forge cannot
// set environment variables inside an already-running shell process without
// OS-level intrusion. Instead, we write a short-lived PowerShell (or bash)
// script that sets the variables, then return its path so the frontend can
// source it in the terminal. The script self-deletes after running so the
// values never persist to disk beyond the sourcing window (typically < 1 second).
//
// Auto-inject at session creation (the recommended path) is handled by
// Vault.GetAutoInjectEnv() in vault.go, which feeds values directly into cmd.Env
// before the PTY process starts ΓÇö completely invisible to terminal output.
package vault

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// BuildInjectionScript creates a temporary script file containing environment
// variable assignments for the specified nameΓåÆvalue pairs.
//
// On Windows the script is PowerShell (.ps1); on Unix it is a POSIX shell
// script (.sh). The script self-deletes after sourcing so secret values are
// never left on disk after the user's shell processes them.
//
// Returns the absolute path to the script file.
// The CALLER is responsible for removing the file if sourcing fails.
func BuildInjectionScript(envVars map[string]string) (string, error) {
	if len(envVars) == 0 {
		return "", fmt.Errorf("no environment variables provided for injection script")
	}

	scriptPath, createErr := buildPlatformScript(envVars)
	if createErr != nil {
		return "", fmt.Errorf("creating injection script: %w", createErr)
	}

	return scriptPath, nil
}

// buildPlatformScript writes a temporary env-var script appropriate for the
// current OS and returns its absolute path.
func buildPlatformScript(envVars map[string]string) (string, error) {
	randomSuffix, suffixErr := generateRandomHex(8)
	if suffixErr != nil {
		return "", suffixErr
	}

	if runtime.GOOS == "windows" {
		return buildPowerShellScript(envVars, randomSuffix)
	}
	return buildPosixShellScript(envVars, randomSuffix)
}

// buildPowerShellScript writes a .ps1 file that sets $env: variables and
// then removes itself. Only the `. script.ps1` command appears in the terminal
// ΓÇö the variable values are never echoed.
func buildPowerShellScript(envVars map[string]string, randomSuffix string) (string, error) {
	scriptPath := filepath.Join(os.TempDir(), "forge-vault-"+randomSuffix+".ps1")

	var scriptBuilder strings.Builder
	scriptBuilder.WriteString("# Forge Vault injection script ΓÇö auto-generated, do not edit\n")
	scriptBuilder.WriteString("# This file self-deletes after running to protect your secrets.\n\n")

	for envVarName, secretValue := range envVars {
		// Escape single quotes in the value by doubling them (PowerShell convention).
		safeValue := strings.ReplaceAll(secretValue, "'", "''")
		scriptBuilder.WriteString(fmt.Sprintf("$env:%s = '%s'\n", envVarName, safeValue))
	}

	// Remove the script file after the assignments so it doesn't linger on disk.
	scriptBuilder.WriteString("\nRemove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue\n")

	scriptContent := scriptBuilder.String()
	if writeErr := os.WriteFile(scriptPath, []byte(scriptContent), 0600); writeErr != nil {
		return "", fmt.Errorf("writing PowerShell injection script: %w", writeErr)
	}

	return scriptPath, nil
}

// buildPosixShellScript writes a .sh file that exports variables and then
// removes itself. Designed to be sourced with `. /path/to/script.sh`.
func buildPosixShellScript(envVars map[string]string, randomSuffix string) (string, error) {
	scriptPath := filepath.Join(os.TempDir(), "forge-vault-"+randomSuffix+".sh")

	var scriptBuilder strings.Builder
	scriptBuilder.WriteString("#!/bin/sh\n")
	scriptBuilder.WriteString("# Forge Vault injection script ΓÇö auto-generated, do not edit\n\n")

	for envVarName, secretValue := range envVars {
		// Escape single quotes for POSIX shell by ending the string, inserting an
		// escaped quote, and reopening the string: value becomes 'before'"'"'after'.
		safeValue := strings.ReplaceAll(secretValue, "'", "'\"'\"'")
		scriptBuilder.WriteString(fmt.Sprintf("export %s='%s'\n", envVarName, safeValue))
	}

	// Remove the script file itself ΓÇö $0 is the script path when sourced.
	scriptBuilder.WriteString("\nrm -f \"$0\"\n")

	scriptContent := scriptBuilder.String()
	if writeErr := os.WriteFile(scriptPath, []byte(scriptContent), 0600); writeErr != nil {
		return "", fmt.Errorf("writing POSIX injection script: %w", writeErr)
	}

	return scriptPath, nil
}

// generateRandomHex returns a hex-encoded string of randomByteCount random bytes.
func generateRandomHex(randomByteCount int) (string, error) {
	randomBytes := make([]byte, randomByteCount)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generating random suffix: %w", err)
	}
	return hex.EncodeToString(randomBytes), nil
}
