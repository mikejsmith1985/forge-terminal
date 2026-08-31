//go:build !windows

// proc_unix.go is the non-Windows no-op for release console suppression.
package releasejobs

import "os/exec"

// suppressReleaseConsoleWindow is unnecessary on Unix-like platforms.
func suppressReleaseConsoleWindow(_ *exec.Cmd) {}
