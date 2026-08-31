//go:build windows

// changes_windows_test.go — verifies the tutor's git command builder suppresses the
// console window on Windows. The tutor watcher analyzes changes in the background;
// an unsuppressed git spawn steals keyboard focus from whatever the user is typing in.
package tutor

import "testing"

func TestNewGitCommand_HidesConsoleWindow(t *testing.T) {
	cmd := newGitCommand(t.TempDir(), "status")

	if cmd.SysProcAttr == nil {
		t.Fatal("newGitCommand did not set SysProcAttr; want non-nil on Windows")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("SysProcAttr.HideWindow = false; want true")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Errorf("SysProcAttr.CreationFlags = %#x; want CREATE_NO_WINDOW (%#x) set",
			cmd.SysProcAttr.CreationFlags, createNoWindowFlag)
	}
}
