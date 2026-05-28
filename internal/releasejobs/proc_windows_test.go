//go:build windows

// proc_windows_test.go verifies Windows release jobs suppress visible consoles.
package releasejobs

import (
	"os/exec"
	"testing"
)

func TestSuppressReleaseConsoleWindow_ConfiguresWindowsProcessAttributes(t *testing.T) {
	command := exec.Command("cmd.exe", "/c", "echo release")

	suppressReleaseConsoleWindow(command)

	if command.SysProcAttr == nil {
		t.Fatal("SysProcAttr was not configured")
	}
	if !command.SysProcAttr.HideWindow {
		t.Fatal("HideWindow = false, want true")
	}
	if command.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Fatalf("CreationFlags = %d, want createNoWindowFlag", command.SysProcAttr.CreationFlags)
	}
}
