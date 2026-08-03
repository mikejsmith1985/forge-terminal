//go:build windows

// tools_vault_windows_test.go — verifies the vault script subprocess builder suppresses
// the console window on Windows. Vault operations run from background agent sessions;
// an unsuppressed pwsh spawn opens a visible console that steals keyboard focus.
package mcp

import (
	"context"
	"testing"
)

func TestNewVaultSubprocess_HidesConsoleWindow(t *testing.T) {
	subproc := newVaultSubprocess(context.Background(), `C:\temp\inject.ps1`, "")

	if subproc.SysProcAttr == nil {
		t.Fatal("newVaultSubprocess did not set SysProcAttr; want non-nil on Windows")
	}
	if !subproc.SysProcAttr.HideWindow {
		t.Error("SysProcAttr.HideWindow = false; want true")
	}
	if subproc.SysProcAttr.CreationFlags&createNoWindowFlag == 0 {
		t.Errorf("SysProcAttr.CreationFlags = %#x; want CREATE_NO_WINDOW (%#x) set",
			subproc.SysProcAttr.CreationFlags, createNoWindowFlag)
	}
}
