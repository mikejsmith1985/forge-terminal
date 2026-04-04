//go:build windows

package terminal

import (
	"os/exec"
	"syscall"
)

// hideExecWindow prevents a child process from flashing a CMD window on Windows.
// Without CREATE_NO_WINDOW, background helpers (tasklist, git) briefly show a
// console window in the taskbar every time the executive trigger fires.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = 0x08000000 // CREATE_NO_WINDOW
	cmd.SysProcAttr.HideWindow = true
}
