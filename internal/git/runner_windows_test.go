// runner_windows_test.go — verifies setSysProcAttr applies CREATE_NO_WINDOW on Windows.
package git

import (
	"os/exec"
	"testing"
)

func TestSetSysProcAttr_SetsHideWindowAndCreationFlags(t *testing.T) {
	cmd := exec.Command("git", "version")
	setSysProcAttr(cmd)

	if cmd.SysProcAttr == nil {
		t.Fatal("setSysProcAttr did not set SysProcAttr; want non-nil on Windows")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("SysProcAttr.HideWindow = false; want true")
	}
	const createNoWindow = uint32(0x08000000)
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Errorf("SysProcAttr.CreationFlags = %#x; want CREATE_NO_WINDOW (%#x) set", cmd.SysProcAttr.CreationFlags, createNoWindow)
	}
}
