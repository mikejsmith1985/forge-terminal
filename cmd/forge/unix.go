//go:build !windows
// +build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// hideWindow is a no-op on non-Windows platforms
func hideWindow(cmd *exec.Cmd) {
	// Nothing to do on Unix-like systems
}

// createDesktopShortcut creates a desktop shortcut for Forge Terminal
func createDesktopShortcut() error {
	// Get the executable path
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Resolve symlinks to get the real path
	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return fmt.Errorf("failed to resolve executable path: %w", err)
	}

	// Get user's home directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	if runtime.GOOS == "darwin" {
		return createMacOSShortcut(execPath, homeDir)
	}
	return createLinuxShortcut(execPath, homeDir)
}

// createLinuxShortcut creates a .desktop file on Linux
func createLinuxShortcut(execPath, homeDir string) error {
	desktopDir := filepath.Join(homeDir, "Desktop")

	// Create Desktop directory if it doesn't exist
	if err := os.MkdirAll(desktopDir, 0755); err != nil {
		return fmt.Errorf("failed to create Desktop directory: %w", err)
	}

	shortcutPath := filepath.Join(desktopDir, "forge-terminal.desktop")

	content := fmt.Sprintf(`[Desktop Entry]
Version=1.0
Type=Application
Name=Forge Terminal
Comment=A modern terminal with AI integrations
Exec=%s
Icon=utilities-terminal
Terminal=false
Categories=Development;System;TerminalEmulator;
`, execPath)

	if err := os.WriteFile(shortcutPath, []byte(content), 0755); err != nil {
		return fmt.Errorf("failed to write desktop file: %w", err)
	}

	// Try to mark as trusted using gio (works on GNOME-based systems)
	gioCmd := exec.Command("gio", "set", shortcutPath, "metadata::trusted", "true")
	_ = gioCmd.Run() // Ignore errors - this is optional

	// Also try chmod to make it executable (redundant but ensures compatibility)
	chmodCmd := exec.Command("chmod", "+x", shortcutPath)
	_ = chmodCmd.Run()

	return nil
}

// createMacOSShortcut creates an alias on macOS Desktop
func createMacOSShortcut(execPath, homeDir string) error {
	desktopDir := filepath.Join(homeDir, "Desktop")

	// Create Desktop directory if it doesn't exist
	if err := os.MkdirAll(desktopDir, 0755); err != nil {
		return fmt.Errorf("failed to create Desktop directory: %w", err)
	}

	aliasPath := filepath.Join(desktopDir, "Forge Terminal")

	// Remove existing alias if present
	os.Remove(aliasPath)

	// Create a symlink as macOS alias (simple approach)
	if err := os.Symlink(execPath, aliasPath); err != nil {
		return fmt.Errorf("failed to create symlink: %w", err)
	}

	return nil
}
