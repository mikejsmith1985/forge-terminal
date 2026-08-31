//go:build windows

// proc_windows.go — console window suppression for file-handler subprocesses on Windows.
// Without CREATE_NO_WINDOW, every exec.Command call (wsl.exe home lookup, ffmpeg frame
// extraction) briefly opens a visible console window that steals keyboard focus from
// whatever application the user is typing in.
package files

import (
	"os/exec"
	"syscall"
)

// createNoWindowFlag is the Windows CREATE_NO_WINDOW process creation flag.
const createNoWindowFlag = 0x08000000

// hideExecWindow prevents a child process from flashing a console window on Windows.
func hideExecWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.CreationFlags = createNoWindowFlag
	cmd.SysProcAttr.HideWindow = true
}
