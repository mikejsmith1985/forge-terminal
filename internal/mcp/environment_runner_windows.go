// environment_runner_windows.go — Windows-specific process creation flags for
// the environment runner. Without these flags, spawning console applications
// like wsl.exe or cmd.exe from a background goroutine pops a visible terminal
// window, which is wrong when Forge itself is the terminal.

package mcp

import (
	"os/exec"
	"syscall"
)

// createNoWindowFlag tells Windows not to allocate a new console window for
// the child process. This is the correct flag when the parent process already
// manages its own terminal (as Forge does).
const createNoWindowFlag = 0x08000000

// suppressConsoleWindow configures the command to run headlessly on Windows.
// The child process inherits stdin/stdout/stderr from the Go buffers we attach,
// so output is captured correctly — just without the popup.
func suppressConsoleWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindowFlag,
	}
}
