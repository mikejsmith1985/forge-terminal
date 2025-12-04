//go:build windows
// +build windows

package terminal

import (
	"fmt"
	"io"
	"os/exec"

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

// resizePTY resizes the PTY window.
func resizePTY(ptmx io.ReadWriteCloser, cols, rows uint16) error {
	cpty, ok := ptmx.(*conpty.ConPty)
	if !ok {
		return fmt.Errorf("invalid pty type")
	}
	return cpty.Resize(int(cols), int(rows))
}
