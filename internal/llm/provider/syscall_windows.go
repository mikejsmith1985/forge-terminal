//go:build windows
// +build windows

// syscall_windows.go — console window suppression for provider CLI probes on Windows.
// HideWindow alone is racy: the console is still allocated and can flash or steal
// keyboard focus before SW_HIDE applies. CREATE_NO_WINDOW prevents the console from
// ever existing, matching every other subprocess-spawning package in this repository.
package provider

import (
	"os/exec"
	"syscall"
)

// createNoWindowFlag is the Windows CREATE_NO_WINDOW process creation flag.
const createNoWindowFlag = 0x08000000

// configureCmdForPlatform prevents provider probe subprocesses (cmd /c where,
// version checks) from ever opening a console window on Windows.
func configureCmdForPlatform(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: createNoWindowFlag,
		HideWindow:    true,
	}
}
