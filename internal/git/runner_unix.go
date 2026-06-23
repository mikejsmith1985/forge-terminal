//go:build !windows

// runner_unix.go — no-op platform shim so runner.go compiles on non-Windows.
package git

import "os/exec"

// setSysProcAttr is a no-op on non-Windows: console suppression is not needed
// because Unix does not create visible windows for subprocess spawns.
func setSysProcAttr(_ *exec.Cmd) {}
