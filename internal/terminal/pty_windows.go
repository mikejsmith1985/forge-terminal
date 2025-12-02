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
	commandLine := cmd.Path
	if len(cmd.Args) > 1 {
		// Simple joining of arguments. For complex cases, proper escaping might be needed.
		commandLine += " " + strings.Join(cmd.Args[1:], " ")
	}
	return conpty.Start(commandLine)
}

// resizePTY resizes the PTY window.
func resizePTY(ptmx io.ReadWriteCloser, cols, rows uint16) error {
	cpty, ok := ptmx.(*conpty.ConPty)
	if !ok {
		return fmt.Errorf("invalid pty type")
	}
	return cpty.Resize(int(cols), int(rows))
}
