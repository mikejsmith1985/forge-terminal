//go:build windows
// +build windows

package terminal

import (
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"

	"github.com/UserExistsError/conpty"
)

// startPTY starts a PTY session on Windows using ConPTY.
func startPTY(cmd *exec.Cmd) (io.ReadWriteCloser, error) {
	// ConPTY takes a command string, not exec.Cmd
	// Use cmd.exe as a wrapper for better compatibility
	cpty, err := conpty.Start("cmd.exe")
	if err != nil {
		return nil, fmt.Errorf("conpty start failed: %w", err)
	}
	return cpty, nil
}

// startPTYWithShell starts a PTY session with a specific shell and arguments.
func startPTYWithShell(shell string, args []string, workingDir string) (io.ReadWriteCloser, error) {
	// Build command line
	commandLine := shell
	if len(args) > 0 {
		commandLine += " " + strings.Join(args, " ")
	}

	cpty, err := conpty.Start(commandLine)
	if err != nil {
		return nil, fmt.Errorf("conpty start failed for %s: %w", commandLine, err)
	}
	
	// For Windows shells, send a CD command to set working directory
	// This is done after a brief delay to ensure the shell is ready
	if workingDir != "" && (shell == "cmd.exe" || shell == "powershell.exe") {
		// Wait for shell to initialize before sending cd command
		go func() {
			// Brief delay to let the shell start and be ready for input
			// 100ms is enough for cmd.exe/powershell.exe to initialize
			time.Sleep(100 * time.Millisecond)
			
			if shell == "cmd.exe" {
				// CMD: use "cd /d" to change directory across drives
				cpty.Write([]byte("cd /d \"" + workingDir + "\"\r"))
			} else if shell == "powershell.exe" {
				// PowerShell: use Set-Location
				cpty.Write([]byte("Set-Location \"" + workingDir + "\"\r"))
			}
		}()
	}
	
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
