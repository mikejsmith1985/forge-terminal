//go:build windows

package workflow

import (
	"os/exec"
	"syscall"
)

// hideExecWindow prevents a child process from opening a visible console window
// on Windows. Without this flag, each exec.Command call briefly flashes a CMD
// window in the user's taskbar — disruptive and confusing in a GUI application.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	// CREATE_NO_WINDOW (0x08000000) tells Windows not to create a console window
	// for the new process. HideWindow ensures no window appears even if one is
	// created by a sub-process of the command.
	cmd.SysProcAttr.CreationFlags = 0x08000000
	cmd.SysProcAttr.HideWindow = true
}
