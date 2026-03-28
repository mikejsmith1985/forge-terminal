//go:build windows

package tunnel

import (
	"os/exec"
	"syscall"
)

// hideWindow prevents the cloudflared subprocess from opening a visible
// console window on Windows. Without this, Windows spawns a new terminal
// window every time the tunnel starts.
func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags = 0x08000000 // CREATE_NO_WINDOW
}
