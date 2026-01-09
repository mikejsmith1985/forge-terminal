//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"

	"github.com/mikejsmith1985/forge-terminal/internal/platform"
)

func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags = 0x08000000
}

func showErrorDialog(title, message string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	procMessageBox := user32.NewProc("MessageBoxW")

	titlePtr, _ := syscall.UTF16PtrFromString(title)
	msgPtr, _ := syscall.UTF16PtrFromString(message)

	// hWnd = 0 (no owner window)
	// uType = 0x10 (MB_ICONHAND / MB_ICONERROR) | 0x00 (MB_OK)
	// | 0x2000 (MB_TASKMODAL) to ensure it appears on top
	const MB_ICONERROR = 0x10
	const MB_OK = 0x00
	const MB_TASKMODAL = 0x2000
	
	procMessageBox.Call(
		0, 
		uintptr(unsafe.Pointer(msgPtr)), 
		uintptr(unsafe.Pointer(titlePtr)), 
		uintptr(MB_ICONERROR|MB_OK|MB_TASKMODAL),
	)
}

func createDesktopShortcut() error {
	return platform.CreateDesktopShortcut()
}
