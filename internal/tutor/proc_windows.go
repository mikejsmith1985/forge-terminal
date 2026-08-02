//go:build windows

package tutor

import (
	"os/exec"
	"syscall"
)

// createNoWindowFlag is the Windows CREATE_NO_WINDOW process creation flag.
const createNoWindowFlag = 0x08000000

// hideExecWindow prevents a child process from flashing a CMD window on Windows.
// Without CREATE_NO_WINDOW, every exec.Command call briefly shows a console window
// in the taskbar — disruptive when the tutor runs CLI tools in the background.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = createNoWindowFlag
	cmd.SysProcAttr.HideWindow = true
}
