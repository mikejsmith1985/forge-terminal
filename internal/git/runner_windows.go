// runner_windows.go — suppresses visible console windows for git subprocesses on Windows.
// Without CREATE_NO_WINDOW every `git` call spawned by the SDD worktree automation
// briefly shows a blank console window, producing the cascading-window effect visible
// when a new tab opens or when the app restarts after an update.
package git

import (
	"os/exec"
	"syscall"
)

// setSysProcAttr hides the console window for a git subprocess on Windows.
// Mirrors the hideWindow helper in cmd/forge/windows.go but lives in the git
// package so the internal runner can call it without a package-level dependency.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000, // CREATE_NO_WINDOW
	}
}
