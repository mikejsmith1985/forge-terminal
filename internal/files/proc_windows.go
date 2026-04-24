//go:build windows

package files

import (
	"os/exec"
	"syscall"
)

// hideExecWindow prevents a child process from flashing a console window on
// Windows. Without CREATE_NO_WINDOW, one-off helpers like wsl.exe and ffmpeg
// briefly pop a console window in the taskbar every time they run — visible
// as a flicker for the end user.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = 0x08000000 // CREATE_NO_WINDOW
	cmd.SysProcAttr.HideWindow = true
}
