//go:build !windows
// +build !windows

package terminal

import (
	"fmt"
	"io"
	"os"
	"os/exec"

	"github.com/creack/pty"
)

// startPTY starts a PTY session on Unix systems (Linux, macOS).
func startPTY(cmd *exec.Cmd) (io.ReadWriteCloser, error) {
	return pty.Start(cmd)
}

// startPTYWithShell is not used on Unix (shell config handled in session.go).
func startPTYWithShell(shell string, args []string, workingDir string) (io.ReadWriteCloser, error) {
	cmd := exec.Command(shell, args...)
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
	)
	if workingDir != "" {
		cmd.Dir = workingDir
	}
	return pty.Start(cmd)
}

// resizePTY resizes the PTY window.
func resizePTY(ptmx io.ReadWriteCloser, cols, rows uint16) error {
	f, ok := ptmx.(*os.File)
	if !ok {
		return fmt.Errorf("invalid pty type")
	}
	return pty.Setsize(f, &pty.Winsize{
		Cols: cols,
		Rows: rows,
	})
}
