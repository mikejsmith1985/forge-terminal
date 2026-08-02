//go:build !windows

// proc_unix_test.go — verifies hideExecWindow is a safe no-op on non-Windows,
// where console windows do not exist.
package files

import (
	"os/exec"
	"testing"
)

func TestHideExecWindow_IsNoOpOnUnix(t *testing.T) {
	cmd := exec.Command("git", "version")
	before := cmd.SysProcAttr
	hideExecWindow(cmd)
	if cmd.SysProcAttr != before {
		t.Error("hideExecWindow modified SysProcAttr on a non-Windows platform; expected no-op")
	}
}
