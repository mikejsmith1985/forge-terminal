//go:build windows

package review

import (
	"os/exec"
	"syscall"
)

// hideExecWindow prevents a child process from flashing a CMD window on Windows.
// Without CREATE_NO_WINDOW, every exec.Command call briefly shows a console window
// in the taskbar — disruptive when the review agent runs CLI tools in the background.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = 0x08000000 // CREATE_NO_WINDOW
	cmd.SysProcAttr.HideWindow = true
}
