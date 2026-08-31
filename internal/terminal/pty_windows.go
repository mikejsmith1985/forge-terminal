//go:build windows
// +build windows

package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/UserExistsError/conpty"
)

// startPTY starts a PTY session on Windows using ConPTY.
func startPTY(cmd *exec.Cmd) (io.ReadWriteCloser, error) {
	// ConPTY takes a command string, not exec.Cmd
	// Use COMSPEC or cmd.exe as a wrapper for better compatibility
	shell := os.Getenv("COMSPEC")
	if shell == "" {
		shell = "cmd.exe"
	}
	
	cpty, err := conpty.Start(shell)
	if err != nil {
		return nil, fmt.Errorf("conpty start failed (shell=%s): %w", shell, err)
	}
	return cpty, nil
}

// startPTYWithShell starts a PTY session with a specific shell and arguments.
// sessionID is the per-tab identity written into the shell as FORGE_SESSION_ID
// so SDD signals can be scoped to this session (specs/010, FR-003).
func startPTYWithShell(shell string, args []string, workingDir string, sessionID string) (io.ReadWriteCloser, error) {
	// Build command line
	commandLine := shell
	if len(args) > 0 {
		commandLine += " " + strings.Join(args, " ")
	}

	// Pass workingDir to ConPTY directly so the process starts in the correct
	// directory immediately. Without this, ConPTY inherits the server's CWD,
	// which causes all tab titles to temporarily (or permanently) show the
	// server's CWD instead of each tab's saved directory after an update.
	var startOpts []conpty.ConPtyOption
	if workingDir != "" {
		startOpts = append(startOpts, conpty.ConPtyWorkDir(workingDir))
	}
	cpty, err := conpty.Start(commandLine, startOpts...)
	if err != nil {
		return nil, fmt.Errorf("conpty start failed for %s: %w", commandLine, err)
	}
	
	// Inject critical environment variables for process safeguard system
	forgePID := os.Getpid()
	forgePortNum := getForgePort()
	
	go func() {
		time.Sleep(100 * time.Millisecond)
		
		// Set environment variables based on shell type
		if strings.Contains(strings.ToLower(shell), "powershell") || strings.Contains(strings.ToLower(shell), "pwsh") {
			// PowerShell: use $env:VAR syntax
			cpty.Write([]byte(fmt.Sprintf("$env:FORGE_INSTANCE_PID=%d\r", forgePID)))
			cpty.Write([]byte(fmt.Sprintf("$env:FORGE_INSTANCE_PORT=%d\r", forgePortNum)))
			// Per-tab SDD identity (FR-003). Single-quoted; sessionID is app-generated, not user input.
			if sessionID != "" {
				cpty.Write([]byte(fmt.Sprintf("$env:FORGE_SESSION_ID='%s'\r", sessionID)))
			}

			if workingDir != "" {
				cpty.Write([]byte("Set-Location \"" + workingDir + "\"\r"))
			}
		} else if strings.Contains(strings.ToLower(shell), "bash") || strings.Contains(strings.ToLower(shell), "zsh") || strings.Contains(strings.ToLower(shell), "sh") {
			// Unix shells: use export
			cpty.Write([]byte(fmt.Sprintf("export FORGE_INSTANCE_PID=%d\r", forgePID)))
			cpty.Write([]byte(fmt.Sprintf("export FORGE_INSTANCE_PORT=%d\r", forgePortNum)))
			// Per-tab SDD identity (FR-003).
			if sessionID != "" {
				cpty.Write([]byte(fmt.Sprintf("export FORGE_SESSION_ID=%s\r", sessionID)))
			}

			if workingDir != "" {
				cpty.Write([]byte("cd \"" + workingDir + "\"\r"))
			}
		} else {
			// CMD.exe: use SET
			cpty.Write([]byte(fmt.Sprintf("SET FORGE_INSTANCE_PID=%d\r", forgePID)))
			cpty.Write([]byte(fmt.Sprintf("SET FORGE_INSTANCE_PORT=%d\r", forgePortNum)))
			// Per-tab SDD identity (FR-003).
			if sessionID != "" {
				cpty.Write([]byte(fmt.Sprintf("SET FORGE_SESSION_ID=%s\r", sessionID)))
			}

			if workingDir != "" {
				cpty.Write([]byte("cd /d \"" + workingDir + "\"\r"))
			}
		}
		
		// Send clear command to hide the environment setup
		if strings.Contains(strings.ToLower(shell), "powershell") || strings.Contains(strings.ToLower(shell), "pwsh") {
			cpty.Write([]byte("Clear-Host\r"))
		} else if strings.Contains(strings.ToLower(shell), "bash") || strings.Contains(strings.ToLower(shell), "zsh") {
			cpty.Write([]byte("clear\r"))
		} else {
			cpty.Write([]byte("cls\r"))
		}
	}()
	
	return cpty, nil
}

// resizePTY resizes the PTY window.
func resizePTY(ptmx io.ReadWriteCloser, cols, rows uint16) error {
	cpty, ok := ptmx.(*conpty.ConPty)
	if !ok {
		return fmt.Errorf("invalid pty type")
	}
	return cpty.Resize(int(cols), int(rows))
}
