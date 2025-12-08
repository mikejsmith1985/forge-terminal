//go:build windows
// +build windows

package terminal

import (
	"fmt"
	"io"
	"os/exec"
	"strings"

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
func startPTYWithShell(shell string, args []string) (io.ReadWriteCloser, error) {
	// Build command line
	commandLine := shell
	if len(args) > 0 {
		commandLine += " " + strings.Join(args, " ")
	}

	cpty, err := conpty.Start(commandLine)
	if err != nil {
		return nil, fmt.Errorf("conpty start failed for %s: %w", commandLine, err)
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
