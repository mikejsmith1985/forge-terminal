//go:build windows

// proc_windows_test.go — verifies hideExecWindow applies CREATE_NO_WINDOW on Windows,
// so file-handler subprocesses (wsl.exe, ffmpeg) never flash a focus-stealing console.
package files

import (
	"os/exec"
	"testing"
)

func TestHideExecWindow_SetsHideWindowAndCreationFlags(t *testing.T) {
	cmd := exec.Command("git", "version")
	hideExecWindow(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("hideExecWindow did not set SysProcAttr; want non-nil on Windows")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("SysProcAttr.HideWindow = false; want true")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Errorf("SysProcAttr.CreationFlags = %#x; want CREATE_NO_WINDOW (%#x) set",
			cmd.SysProcAttr.CreationFlags, createNoWindowFlag)
	}
}
