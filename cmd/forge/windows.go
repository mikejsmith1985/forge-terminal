//go:build windows

package main

import (
	"os/exec"
	"syscall"

	"github.com/mikejsmith1985/forge-terminal/internal/platform"
)

func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags = 0x08000000
}

func createDesktopShortcut() error {
	return platform.CreateDesktopShortcut()
}
