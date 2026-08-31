//go:build !windows

// runner_unix_test.go — verifies setSysProcAttr is a safe no-op on non-Windows.
package git

import (
	"os/exec"
	"testing"
)

func TestSetSysProcAttr_IsNoOpOnUnix(t *testing.T) {
	cmd := exec.Command("git", "version")
	before := cmd.SysProcAttr
	setSysProcAttr(cmd)
	if cmd.SysProcAttr != before {
		t.Error("setSysProcAttr modified SysProcAttr on a non-Windows platform; expected no-op")
	}
}
