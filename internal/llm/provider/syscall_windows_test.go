//go:build windows

// syscall_windows_test.go — proves provider CLI probes can never flash a console
// window: both CREATE_NO_WINDOW and HideWindow must be set, matching every other
// subprocess-spawning package in this repository (see internal/files/proc_windows.go).
package provider

import (
	"os/exec"
	"testing"
)

func TestConfigureCmdForPlatform_SuppressesConsoleWindow(t *testing.T) {
	command := exec.Command("git", "version")

	configureCmdForPlatform(command)

	if command.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be configured")
	}
	if command.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Fatal("expected CREATE_NO_WINDOW creation flag — HideWindow alone is racy and can steal focus")
	}
	if !command.SysProcAttr.HideWindow {
		t.Fatal("expected HideWindow to remain set")
	}
}
