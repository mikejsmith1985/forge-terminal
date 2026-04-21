// environment_runner_windows_test.go verifies that the Windows-specific
// suppressConsoleWindow function sets the expected SysProcAttr fields.
package mcp

import (
	"os/exec"
	"testing"
)

func TestSuppressConsoleWindowSetsHideWindowOnWindows(t *testing.T) {
	t.Parallel()
	cmd := exec.Command("echo", "test")
	suppressConsoleWindow(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be set, got nil")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("expected HideWindow to be true")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Errorf("expected CreationFlags to include CREATE_NO_WINDOW (0x%08x), got 0x%08x",
			createNoWindowFlag, cmd.SysProcAttr.CreationFlags)
	}
}
