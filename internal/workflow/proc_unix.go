//go:build !windows

package workflow

import "os/exec"

// hideExecWindow is a no-op on Unix platforms — console windows don't exist there.
func hideExecWindow(_ *exec.Cmd) {}
