//go:build windows

package files

import (
	"os/exec"
	"testing"
)

// TestHideExecWindow_Windows verifies the helper sets CREATE_NO_WINDOW on
// the SysProcAttr so child processes do not flash a console window.
func TestHideExecWindow_Windows(t *testing.T) {
	cmd := exec.Command("cmd", "/c", "echo", "hi")
	hideExecWindow(cmd)
	if cmd.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be populated")
	}
	const createNoWindow = 0x08000000
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Errorf("expected CREATE_NO_WINDOW flag on CreationFlags, got %#x",
			cmd.SysProcAttr.CreationFlags)
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("expected HideWindow=true")
	}
}
