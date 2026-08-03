//go:build windows

// sdd_report_card_windows_test.go — verifies the report card's git command builder
// suppresses the console window on Windows. Report cards are generated when an SDD
// phase completes in the background; an unsuppressed git spawn steals keyboard focus.
package main

import "testing"

func TestNewRepoGitCommand_HidesConsoleWindow(t *testing.T) {
	cmd := newRepoGitCommand(t.TempDir(), "status")

	if cmd.SysProcAttr == nil {
		t.Fatal("newRepoGitCommand did not set SysProcAttr; want non-nil on Windows")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("SysProcAttr.HideWindow = false; want true")
	}
	if cmd.SysProcAttr.CreationFlags == 0 {
		t.Error("SysProcAttr.CreationFlags = 0; want CREATE_NO_WINDOW set")
	}
}
