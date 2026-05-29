//go:build !windows

// proc_unix_test.go verifies release console suppression is a no-op on Unix.
package releasejobs

import (
	"os/exec"
	"testing"
)

func TestSuppressReleaseConsoleWindow_IsNoopOnUnix(t *testing.T) {
	command := exec.Command("sh", "-c", "echo release")

	suppressReleaseConsoleWindow(command)

	if command.SysProcAttr != nil {
		t.Fatalf("SysProcAttr = %#v, want nil on Unix", command.SysProcAttr)
	}
}
