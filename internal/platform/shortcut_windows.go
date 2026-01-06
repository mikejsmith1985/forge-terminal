//go:build windows

package platform

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags = 0x08000000
}

type ShortcutError struct {
	Step    string
	Message string
	Err     error
}

func (e *ShortcutError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %s - %v", e.Step, e.Message, e.Err)
	}
	return fmt.Sprintf("%s: %s", e.Step, e.Message)
}

func CreateDesktopShortcut() error {
	execPath, err := os.Executable()
	if err != nil {
		return &ShortcutError{
			Step:    "GetExecutable",
			Message: "failed to get executable path",
			Err:     err,
		}
	}

	execPath, err = filepath.EvalSymlinks(execPath)
	if err != nil {
		return &ShortcutError{
			Step:    "ResolveSymlinks",
			Message: "failed to resolve executable path",
			Err:     err,
		}
	}

	desktopPath, err := getDesktopPath()
	if err != nil {
		return err
	}

	shortcutPath := filepath.Join(desktopPath, "Forge Terminal.lnk")

	if err := createShortcutViaPS(shortcutPath, execPath); err != nil {
		return &ShortcutError{
			Step:    "CreateShortcut",
			Message: "failed to create shortcut via PowerShell",
			Err:     err,
		}
	}

	if err := verifyShortcut(shortcutPath); err != nil {
		log.Printf("[Shortcut] Warning: Shortcut created but verification failed: %v", err)
	}

	return nil
}

func getDesktopPath() (string, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-Command",
		"[Environment]::GetFolderPath('Desktop')")
	hideWindow(cmd)

	output, err := cmd.Output()
	if err != nil {
		return "", &ShortcutError{
			Step:    "GetDesktopPath",
			Message: "failed to get Desktop path via PowerShell",
			Err:     err,
		}
	}

	desktopPath := strings.TrimSpace(string(output))
	if desktopPath == "" {
		return "", &ShortcutError{
			Step:    "GetDesktopPath",
			Message: "Desktop path is empty",
			Err:     nil,
		}
	}

	return desktopPath, nil
}

func createShortcutViaPS(shortcutPath, execPath string) error {
	// Convert Windows backslashes to forward slashes for PowerShell compatibility
	// PowerShell handles forward slashes as path separators on Windows
	shortcutPathPS := strings.ReplaceAll(shortcutPath, "\\", "/")
	execPathPS := strings.ReplaceAll(execPath, "\\", "/")
	workingDirPS := strings.ReplaceAll(filepath.Dir(execPath), "\\", "/")

	psScript := fmt.Sprintf(`
$ErrorActionPreference = 'Stop'
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut('%s')
    $Shortcut.TargetPath = '%s'
    $Shortcut.WorkingDirectory = '%s'
    $Shortcut.Description = 'Forge Terminal - Modern terminal with AI'
    $Shortcut.IconLocation = '%s,0'
    $Shortcut.Save()
    Write-Host "SUCCESS"
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
`, shortcutPathPS, execPathPS, workingDirPS, execPathPS)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", psScript)
	hideWindow(cmd)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell execution failed: %w - output: %s", err, string(output))
	}

	if !strings.Contains(string(output), "SUCCESS") {
		return fmt.Errorf("shortcut creation did not complete successfully")
	}

	return nil
}

func verifyShortcut(shortcutPath string) error {
	info, err := os.Stat(shortcutPath)
	if err != nil {
		return fmt.Errorf("shortcut file not found: %w", err)
	}

	if info.Size() == 0 {
		return fmt.Errorf("shortcut file is empty")
	}

	timeoutCh := time.After(2 * time.Second)
	checkTicker := time.NewTicker(100 * time.Millisecond)
	defer checkTicker.Stop()

	for {
		select {
		case <-timeoutCh:
			return fmt.Errorf("shortcut verification timeout")
		case <-checkTicker.C:
			info, err := os.Stat(shortcutPath)
			if err == nil && info.Size() > 0 {
				return nil
			}
		}
	}
}
