//go:build !windows

// environment_runner_unix_test.go verifies that suppressConsoleWindow is a
// safe no-op on non-Windows platforms — it must not panic or set any fields.
package mcp

import (
	"os/exec"
	"testing"
)

func TestSuppressConsoleWindowIsNoOpOnUnix(t *testing.T) {
	t.Parallel()
	cmd := exec.Command("echo", "test")
	// SysProcAttr is nil before the call on all platforms.
	suppressConsoleWindow(cmd)
	// On non-Windows the stub must leave SysProcAttr unchanged (nil).
	if cmd.SysProcAttr != nil {
		t.Error("expected suppressConsoleWindow to be a no-op on non-Windows (SysProcAttr should remain nil)")
	}
}
