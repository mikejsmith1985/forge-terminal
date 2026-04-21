//go:build !windows

// environment_runner_unix.go — non-Windows stub for suppressConsoleWindow.
// On Linux and macOS, console window suppression is not needed; child processes
// never open a GUI window unless explicitly programmed to do so.

package mcp

import "os/exec"

// suppressConsoleWindow is a no-op on non-Windows platforms.
func suppressConsoleWindow(_ *exec.Cmd) {}
