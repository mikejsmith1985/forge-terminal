// Package am provides session recovery capabilities.
package am

import (
	"fmt"
	"os/exec"
	"runtime"
	"strings"
)

// =============================================================================
// Recovery Commands
// =============================================================================

// RecoveryCommand represents a command to resume a session
type RecoveryCommand struct {
	Provider  Provider
	SessionID string
	Command   string
	Args      []string
}

// BuildRecoveryCommand creates the appropriate resume command for a session
func BuildRecoveryCommand(sessionID string, provider Provider) *RecoveryCommand {
	switch provider {
	case ProviderCopilot:
		return &RecoveryCommand{
			Provider:  ProviderCopilot,
			SessionID: sessionID,
			Command:   "copilot",
			Args:      []string{"--resume", sessionID},
		}
	case ProviderClaude:
		return &RecoveryCommand{
			Provider:  ProviderClaude,
			SessionID: sessionID,
			Command:   "claude",
			Args:      []string{"--resume", sessionID},
		}
	default:
		return nil
	}
}

// Execute runs the recovery command (launches in new terminal/process)
func (rc *RecoveryCommand) Execute() error {
	if rc == nil {
		return fmt.Errorf("invalid recovery command")
	}

	// Build full command
	fullCmd := append([]string{rc.Command}, rc.Args...)
	cmdStr := strings.Join(fullCmd, " ")

	// Launch based on OS
	switch runtime.GOOS {
	case "windows":
		// Launch in new PowerShell window
		cmd := exec.Command("powershell", "-NoExit", "-Command", cmdStr)
		return cmd.Start()
	
	case "darwin":
		// Launch in new Terminal window on macOS
		script := fmt.Sprintf(`tell application "Terminal" to do script "%s"`, cmdStr)
		cmd := exec.Command("osascript", "-e", script)
		return cmd.Run()
	
	case "linux":
		// Try common terminal emulators
		terminals := []string{"gnome-terminal", "konsole", "xterm"}
		for _, term := range terminals {
			if _, err := exec.LookPath(term); err == nil {
				cmd := exec.Command(term, "-e", cmdStr)
				return cmd.Start()
			}
		}
		return fmt.Errorf("no suitable terminal emulator found")
	
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// GetCommandString returns the command as a string for display/copy
func (rc *RecoveryCommand) GetCommandString() string {
	if rc == nil {
		return ""
	}
	return fmt.Sprintf("%s %s", rc.Command, strings.Join(rc.Args, " "))
}

// =============================================================================
// Recovery Manager
// =============================================================================

// RecoveryManager handles session recovery operations
type RecoveryManager struct {
	monitor *NativeMonitor
}

// NewRecoveryManager creates a new recovery manager
func NewRecoveryManager() *RecoveryManager {
	return &RecoveryManager{
		monitor: NewNativeMonitor(),
	}
}

// ListRecoverableSessions returns all sessions that can be resumed
func (rm *RecoveryManager) ListRecoverableSessions(limit int) ([]*NativeSession, error) {
	sessions, err := rm.monitor.GetRecentSessions(limit)
	if err != nil {
		return nil, err
	}

	// Filter to only recoverable
	recoverable := make([]*NativeSession, 0, len(sessions))
	for _, s := range sessions {
		status := rm.monitor.ValidateRecovery(s.ID, s.Provider)
		if status.Recoverable {
			recoverable = append(recoverable, s)
		}
	}

	return recoverable, nil
}

// RecoverSession attempts to resume a specific session
func (rm *RecoveryManager) RecoverSession(sessionID string, provider Provider) error {
	// Validate recovery is possible
	status := rm.monitor.ValidateRecovery(sessionID, provider)
	if !status.Recoverable {
		return fmt.Errorf("session not recoverable: %s", status.Reason)
	}

	// Build and execute recovery command
	cmd := BuildRecoveryCommand(sessionID, provider)
	if cmd == nil {
		return fmt.Errorf("failed to build recovery command")
	}

	return cmd.Execute()
}

// GetRecoveryCommand returns the command string for a session (for display/manual execution)
func (rm *RecoveryManager) GetRecoveryCommand(sessionID string, provider Provider) (string, error) {
	status := rm.monitor.ValidateRecovery(sessionID, provider)
	if !status.Recoverable {
		return "", fmt.Errorf("session not recoverable: %s", status.Reason)
	}

	cmd := BuildRecoveryCommand(sessionID, provider)
	if cmd == nil {
		return "", fmt.Errorf("failed to build recovery command")
	}

	return cmd.GetCommandString(), nil
}

// GetActiveSession returns the currently active (most recent) session
func (rm *RecoveryManager) GetActiveSession() (*NativeSession, error) {
	return rm.monitor.GetActiveSession()
}

// ValidateSessionRecovery checks if a session can be recovered
func (rm *RecoveryManager) ValidateSessionRecovery(sessionID string, provider Provider) RecoveryStatus {
	return rm.monitor.ValidateRecovery(sessionID, provider)
}
