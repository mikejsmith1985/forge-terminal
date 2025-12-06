//go:build windows
// +build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

// hideWindow sets the command to run without showing a console window on Windows
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}

// createDesktopShortcut creates a desktop shortcut for Forge Terminal on Windows
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

	// Get user's Desktop folder using PowerShell
	cmd := exec.Command("powershell", "-NoProfile", "-Command",
		"[Environment]::GetFolderPath('Desktop')")
	hideWindow(cmd)
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to get Desktop path: %w", err)
	}

	desktopPath := string(output)
	// Trim whitespace/newlines
	desktopPath = filepath.Clean(desktopPath[:len(desktopPath)-1])

	shortcutPath := filepath.Join(desktopPath, "Forge Terminal.lnk")

	// Create shortcut using PowerShell
	psScript := fmt.Sprintf(`
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('%s')
$Shortcut.TargetPath = '%s'
$Shortcut.WorkingDirectory = '%s'
$Shortcut.Description = 'Forge Terminal - Modern terminal with AI integrations'
$Shortcut.Save()
`, shortcutPath, execPath, filepath.Dir(execPath))

	createCmd := exec.Command("powershell", "-NoProfile", "-Command", psScript)
	hideWindow(createCmd)
	if err := createCmd.Run(); err != nil {
		return fmt.Errorf("failed to create shortcut: %w", err)
	}

	return nil
}
