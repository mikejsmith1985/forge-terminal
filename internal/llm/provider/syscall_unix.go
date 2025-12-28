//go:build !windows
// +build !windows

package provider

import "os/exec"

// configureCmdForPlatform is a no-op on Unix systems.
func configureCmdForPlatform(cmd *exec.Cmd) {
	// No special configuration needed on Unix
}
