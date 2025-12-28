//go:build windows
// +build windows

package provider

import (
	"os/exec"
	"syscall"
)

// configureCmdForPlatform configures the command to hide console windows on Windows.
func configureCmdForPlatform(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
}
