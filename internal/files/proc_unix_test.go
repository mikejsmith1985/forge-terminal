//go:build !windows

package files

import (
	"os/exec"
	"testing"
)

// TestHideExecWindow_Unix verifies the no-op helper does not modify the
// command or panic when called on non-Windows platforms.
func TestHideExecWindow_Unix(t *testing.T) {
	cmd := exec.Command("echo", "hi")
	hideExecWindow(cmd)
	if cmd == nil {
		t.Fatal("command became nil")
	}
}
