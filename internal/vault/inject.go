// inject.go — Manual secret injection into running PTY sessions.
//
// When a user clicks "Inject Now" for one or more vault entries, Forge cannot
// set environment variables inside an already-running shell process without
// OS-level intrusion. Instead, we write a short-lived PowerShell (or bash)
// script that sets the variables, then return its path so the frontend can
// source it in the terminal. The script self-deletes after running so the
// values never persist to disk beyond the sourcing window (typically < 1 second).
//
// Entry names are free text, and shells disagree about which names they accept —
// see envvarname.go for the rules and for why an unparsable line is a secret
// leak rather than a mere inconvenience. Every assignment written here goes
// through those rules first.
//
// Auto-inject at session creation (the recommended path) is handled by
// Vault.GetAutoInjectEnv() in vault.go, which feeds values directly into cmd.Env
// before the PTY process starts — completely invisible to terminal output, and
// unaffected by shell naming rules.
package vault

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

const (
	// injectionScriptFileMode keeps the temporary script readable only by its owner
	// for the second or so it exists on disk.
	injectionScriptFileMode = 0600

	// injectionScriptSuffixBytes is the amount of randomness in the temp file name,
	// enough that two concurrent injections never collide.
	injectionScriptSuffixBytes = 8

	// scriptHeaderComment opens every generated script so a user who catches one
	// mid-flight knows what it is and that it deletes itself.
	scriptHeaderComment = "# Forge Vault injection script — auto-generated, do not edit\n" +
		"# This file self-deletes after running to protect your secrets.\n\n"
)

// BuildInjectionScript creates a temporary script file containing environment
// variable assignments for the specified name→value pairs.
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
	randomSuffix, suffixErr := generateRandomHex(injectionScriptSuffixBytes)
	if suffixErr != nil {
		return "", suffixErr
	}

	if runtime.GOOS == "windows" {
		return writeScriptFile("forge-vault-"+randomSuffix+".ps1", buildPowerShellScriptBody(envVars))
	}
	return writeScriptFile("forge-vault-"+randomSuffix+".sh", buildPosixShellScriptBody(envVars))
}

// writeScriptFile saves generated script text to a private temp file and returns
// its absolute path.
func writeScriptFile(fileName string, scriptContent string) (string, error) {
	scriptPath := filepath.Join(os.TempDir(), fileName)
	if writeErr := os.WriteFile(scriptPath, []byte(scriptContent), injectionScriptFileMode); writeErr != nil {
		return "", fmt.Errorf("writing injection script %s: %w", fileName, writeErr)
	}
	return scriptPath, nil
}

// buildPowerShellScriptBody renders a .ps1 body that sets the variables and then
// removes itself. Only the `. script.ps1` command appears in the terminal — the
// values are never echoed.
//
// Every name uses the braced ${env:NAME} form, the one PowerShell syntax that
// accepts hyphens, dots, and spaces. The bare $env:NAME shorthand stops at the
// first hyphen and turns the whole assignment — value included — into a printed
// parser error, so it is never used here regardless of how tame the name looks.
func buildPowerShellScriptBody(envVars map[string]string) string {
	var scriptBuilder strings.Builder
	scriptBuilder.WriteString(scriptHeaderComment)

	for _, envVarName := range sortedEnvVarNames(envVars) {
		// Escape single quotes in the value by doubling them (PowerShell convention).
		safeValue := strings.ReplaceAll(envVars[envVarName], "'", "''")
		scriptBuilder.WriteString(fmt.Sprintf("%s = '%s'\n", quotePowerShellVariableName(envVarName), safeValue))
	}

	// Remove the script file after the assignments so it doesn't linger on disk.
	scriptBuilder.WriteString("\nRemove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue\n")
	return scriptBuilder.String()
}

// buildPosixShellScriptBody renders a .sh body that exports the variables and
// then removes itself. Designed to be sourced with `. /path/to/script.sh`.
//
// POSIX shells cannot hold a variable whose name is not a plain identifier, and
// no quoting changes that — `export RESEND-API-KEY=...` is rejected by every
// shell, and the rejection echoes the value. Such an entry is therefore exported
// under its derived underscore name instead, with a warning naming both forms so
// the user is never left guessing which variable their tool should read.
func buildPosixShellScriptBody(envVars map[string]string) string {
	var scriptBuilder strings.Builder
	scriptBuilder.WriteString("#!/bin/sh\n")
	scriptBuilder.WriteString(scriptHeaderComment)

	orderedNames := sortedEnvVarNames(envVars)
	claimedNames := collectPosixValidNames(orderedNames)

	for _, entryName := range orderedNames {
		exportName, warningText := resolvePosixExportName(entryName, claimedNames)
		if warningText != "" {
			scriptBuilder.WriteString(warningText)
		}
		if exportName == "" {
			continue
		}
		claimedNames[exportName] = true

		// Escape single quotes for POSIX shell by ending the string, inserting an
		// escaped quote, and reopening the string: value becomes 'before'"'"'after'.
		safeValue := strings.ReplaceAll(envVars[entryName], "'", `'"'"'`)
		scriptBuilder.WriteString(fmt.Sprintf("export %s='%s'\n", exportName, safeValue))
	}

	// Remove the script file itself — $0 is the script path when sourced.
	scriptBuilder.WriteString("\nrm -f \"$0\"\n")
	return scriptBuilder.String()
}

// resolvePosixExportName decides which name an entry is exported under on POSIX
// shells, returning an empty name when the entry cannot be delivered at all.
//
// The second return value is a ready-to-write warning line (empty when the name
// needed no adjustment). Warnings name the entry only — never its value.
func resolvePosixExportName(entryName string, claimedNames map[string]bool) (exportName string, warningText string) {
	if IsPosixEnvVarName(entryName) {
		return entryName, ""
	}

	derivedName := NormalizeEnvVarName(entryName)
	if derivedName == "" {
		return "", warnPosix(fmt.Sprintf(
			"Forge Vault: entry %s cannot be used as a shell variable name and was skipped. Rename it using letters, digits, and underscores.",
			entryName))
	}
	if claimedNames[derivedName] {
		return "", warnPosix(fmt.Sprintf(
			"Forge Vault: entry %s would collide with the existing variable %s and was skipped. Rename one of them.",
			entryName, derivedName))
	}

	return derivedName, warnPosix(fmt.Sprintf(
		"Forge Vault: entry %s is not a valid POSIX variable name; exported as %s instead.",
		entryName, derivedName))
}

// warnPosix formats a diagnostic that prints to stderr when the script is sourced.
// The message is single-quoted so an unusual entry name cannot become a command.
func warnPosix(message string) string {
	return "printf '%s\\n' " + quotePosixSingleQuoted(message) + " >&2\n"
}

// collectPosixValidNames returns the set of entry names that are already valid
// POSIX identifiers, so a derived fallback name never silently overwrites one.
func collectPosixValidNames(entryNames []string) map[string]bool {
	claimedNames := make(map[string]bool, len(entryNames))
	for _, entryName := range entryNames {
		if IsPosixEnvVarName(entryName) {
			claimedNames[entryName] = true
		}
	}
	return claimedNames
}

// sortedEnvVarNames returns the map's keys in a stable order so generated scripts
// are reproducible and diffable in tests.
func sortedEnvVarNames(envVars map[string]string) []string {
	orderedNames := make([]string, 0, len(envVars))
	for envVarName := range envVars {
		orderedNames = append(orderedNames, envVarName)
	}
	sort.Strings(orderedNames)
	return orderedNames
}

// generateRandomHex returns a hex-encoded string of randomByteCount random bytes.
func generateRandomHex(randomByteCount int) (string, error) {
	randomBytes := make([]byte, randomByteCount)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generating random suffix: %w", err)
	}
	return hex.EncodeToString(randomBytes), nil
}
