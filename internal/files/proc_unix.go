//go:build !windows

// proc_unix.go — no-op console suppression stub: console windows don't exist on Unix.
package files

import "os/exec"

// hideExecWindow is a no-op on non-Windows platforms.
func hideExecWindow(_ *exec.Cmd) {}
