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
	// Ensure environment variables are set (redundant but safe)
	cmd.Env = append(cmd.Env,
		fmt.Sprintf("FORGE_INSTANCE_PID=%d", os.Getpid()),
		fmt.Sprintf("FORGE_INSTANCE_PORT=%d", getForgePort()),
	)
	return pty.Start(cmd)
}

// startPTYWithShell is not used on Unix (shell config handled in session.go),
// but is kept signature-compatible with the Windows build. It injects the same
// per-tab FORGE_SESSION_ID identity via cmd.Env (specs/010, FR-003).
func startPTYWithShell(shell string, args []string, workingDir string, sessionID string) (io.ReadWriteCloser, error) {
	cmd := exec.Command(shell, args...)
	cmd.Env = forgeSessionEnv(os.Environ(), sessionID)
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
