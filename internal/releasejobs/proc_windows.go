//go:build windows

// proc_windows.go hides release job child consoles on Windows.
package releasejobs

import (
	"os/exec"
	"syscall"
)

const createNoWindowFlag = 0x08000000

// suppressReleaseConsoleWindow keeps background releases silent in Forge Terminal.
func suppressReleaseConsoleWindow(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindowFlag,
	}
}
