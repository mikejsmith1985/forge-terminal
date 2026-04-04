//go:build !windows

package tutor

import "os/exec"

// hideExecWindow is a no-op on Unix — console windows don't exist there.
func hideExecWindow(_ *exec.Cmd) {}
