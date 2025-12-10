package am

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	hookStartMarker = "# --- Forge Shell Hook (added by Forge) ---"
	hookEndMarker   = "# --- End Forge Shell Hook ---"
)

// RemovedHook represents a hook that was removed from a file.
type RemovedHook struct {
	FilePath string `json:"filePath"`
	Backup   string `json:"backup"`
}

// RemoveShellHooks removes Forge hooks from shell rc files.
// Returns list of files that were modified, creating backups before removal.
func RemoveShellHooks() ([]RemovedHook, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("failed to get home directory: %w", err)
	}

	removed := []RemovedHook{}

	// Check common shell rc files
	rcFiles := []string{
		filepath.Join(homeDir, ".bashrc"),
		filepath.Join(homeDir, ".zshrc"),
		filepath.Join(homeDir, ".bash_profile"),
		// Note: PowerShell profile handling would go here if needed
	}

	for _, rcFile := range rcFiles {
		// Check if file exists
		if _, err := os.Stat(rcFile); os.IsNotExist(err) {
			continue // File doesn't exist, skip
		}

		// Check if file contains hooks
		hasHooks, err := fileContainsHooks(rcFile)
		if err != nil {
			return removed, fmt.Errorf("failed to check %s: %w", rcFile, err)
		}

		if !hasHooks {
			continue // No hooks in this file
		}

		// Create timestamped backup
		backup := rcFile + ".forge-backup-" + time.Now().Format("20060102-150405")
		if err := copyFile(rcFile, backup); err != nil {
			return removed, fmt.Errorf("backup failed for %s: %w", rcFile, err)
		}

		// Remove hooks
		if err := removeHooksFromFile(rcFile); err != nil {
			return removed, fmt.Errorf("removal failed for %s: %w", rcFile, err)
		}

		removed = append(removed, RemovedHook{
			FilePath: rcFile,
			Backup:   backup,
		})
	}

	return removed, nil
}

// fileContainsHooks checks if a file contains Forge shell hooks.
func fileContainsHooks(filePath string) (bool, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, hookStartMarker) {
			return true, nil
		}
	}

	return false, scanner.Err()
}

// removeHooksFromFile removes hook blocks from a single file.
// Only removes content between hookStartMarker and hookEndMarker.
func removeHooksFromFile(filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	inHookBlock := false

	for scanner.Scan() {
		line := scanner.Text()

		if strings.Contains(line, hookStartMarker) {
			inHookBlock = true
			continue // Skip start marker
		}

		if strings.Contains(line, hookEndMarker) {
			inHookBlock = false
			continue // Skip end marker
		}

		if !inHookBlock {
			lines = append(lines, line)
		}
	}

	if err := scanner.Err(); err != nil {
		return err
	}

	// Write back (preserve original permissions)
	info, err := os.Stat(filePath)
	if err != nil {
		return err
	}

	output := strings.Join(lines, "\n")
	if len(lines) > 0 {
		output += "\n" // Ensure trailing newline
	}

	return os.WriteFile(filePath, []byte(output), info.Mode())
}

// copyFile creates a copy of a file.
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}

	// Preserve source file permissions
	info, err := os.Stat(src)
	if err != nil {
		return err
	}

	return os.WriteFile(dst, data, info.Mode())
}
