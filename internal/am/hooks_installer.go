package am

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/storage"
)

// InstallShellHooks writes a helper script to the user's ~/.forge directory
// with instructions for installing shell hooks. It also emits a Layer 2 heartbeat
// event so the health monitor can mark Shell Hooks as healthy after installation.
func InstallShellHooks() (string, string, error) {
	forgeDir := storage.GetForgeDir()
	if err := os.MkdirAll(forgeDir, 0755); err != nil {
		return "", "", fmt.Errorf("failed to create .forge dir: %w", err)
	}

	scriptPath := filepath.Join(forgeDir, "install-shell-hooks.sh")
	scriptContent := `#!/usr/bin/env bash
# Forge Terminal - Shell Hooks installer helper
# This file contains example hook snippets for bash/zsh and PowerShell.
# Review and append the appropriate snippet to your shell rc file (e.g. ~/.bashrc, ~/.zshrc, or PowerShell profile).

# Example (bash/zsh): append this to ~/.bashrc or ~/.zshrc
#
# forge_shell_hook() {
#   # Notify Forge that a command was executed
#   # curl -s -X POST http://localhost:8333/api/am/hook -H "Content-Type: application/json" -d "{\"tabId\": \"<TAB>\", \"command\": \"$1\"}" || true
# }
# PROMPT_COMMAND='forge_shell_hook "$(history 1 | sed "s/^ *[0-9]* *//")"; '$PROMPT_COMMAND

# Example (PowerShell): append to your PowerShell profile
#
# function global:ForgeShellHook {
#   param($command)
#   # Use Invoke-RestMethod to call the local API
#   # Invoke-RestMethod -Method Post -Uri http://localhost:8333/api/am/hook -Body (@{ tabId = '<TAB>'; command = $command } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction SilentlyContinue
# }
# Register-EngineEvent PowerShell.Exiting -Action { ForgeShellHook $LASTEXITCODE }

echo "Script generated. Follow the comments in this file to enable shell hooks."
`

	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0755); err != nil {
		return "", "", fmt.Errorf("failed to write install script: %w", err)
	}

	// Emit a Layer 2 heartbeat so HealthMonitor sees activity (best-effort)
	EventBus.Publish(&LayerEvent{
		Type:      "HEARTBEAT",
		Layer:     2,
		Timestamp: time.Now(),
	})

	return scriptPath, scriptContent, nil
}

// GetSnippet returns a snippet string for the given shell type.
func GetSnippet(shell string) string {
	switch shell {
	case "powershell":
		return `# Forge Shell Hook - PowerShell (append to your PowerShell profile)
function global:ForgeShellHook {
    param($command)
    Invoke-RestMethod -Method Post -Uri http://localhost:8333/api/am/hook -Body (@{ command = $command } | ConvertTo-Json) -ContentType 'application/json' -ErrorAction SilentlyContinue
}
# Example registration (run once):
# Register-EngineEvent PowerShell.Exiting -Action { ForgeShellHook $LASTEXITCODE }
`
	default:
		return `# Forge Shell Hook - Bash/Zsh (append to ~/.bashrc or ~/.zshrc)
forge_shell_hook() {
    # Send last command to Forge (best-effort)
    curl -s -X POST http://localhost:8333/api/am/hook -H "Content-Type: application/json" -d "{\"command\": \"$1\"}" || true
}
PROMPT_COMMAND='forge_shell_hook "$(history 1 | sed "s/^ *[0-9]* *//")"; '$PROMPT_COMMAND
`
	}
}

// ApplyShellHooks appends the appropriate snippet to the user's shell rc file and returns the path written to.
func ApplyShellHooks(shell string) (string, string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", "", fmt.Errorf("failed to get home dir: %w", err)
	}

	snippet := GetSnippet(shell)
	var target string
	if shell == "powershell" {
		// Attempt to write to PowerShell profile location
		if runtime.GOOS == "windows" {
			target = filepath.Join(home, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1")
		} else {
			target = filepath.Join(home, ".config", "powershell", "profile.ps1")
		}
	} else {
		// Default to ~/.bashrc
		if _, err := os.Stat(filepath.Join(home, ".bashrc")); err == nil {
			target = filepath.Join(home, ".bashrc")
		} else if _, err := os.Stat(filepath.Join(home, ".zshrc")); err == nil {
			target = filepath.Join(home, ".zshrc")
		} else {
			target = filepath.Join(home, ".bashrc")
		}
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
		return "", "", fmt.Errorf("failed to create directory for profile: %w", err)
	}

	// If target exists, create a timestamped backup
	backupPath := ""
	if _, err := os.Stat(target); err == nil {
		content, err := os.ReadFile(target)
		if err == nil {
			ts := time.Now().Format("20060102T150405")
			backupPath = target + ".forge-backup-" + ts
			_ = os.WriteFile(backupPath, content, 0644)
		}
	}

	f, err := os.OpenFile(target, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return "", "", fmt.Errorf("failed to open target file: %w", err)
	}
	defer f.Close()

	if _, err := f.WriteString("\n# --- Forge Shell Hook (added by Forge) ---\n" + snippet + "\n# --- End Forge Shell Hook ---\n"); err != nil {
		return "", "", fmt.Errorf("failed to write snippet: %w", err)
	}

	// Emit heartbeat indicating hooks likely installed
	EventBus.Publish(&LayerEvent{
		Type:      "HOOK_INSTALLED",
		Layer:     2,
		Timestamp: time.Now(),
	})

	return target, backupPath, nil
}
