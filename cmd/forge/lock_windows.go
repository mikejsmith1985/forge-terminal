//go:build windows

package main

import "syscall"

const (
	processSynchronize = 0x00100000
	waitTimeout        = 258 // WAIT_TIMEOUT — process handle is still live
)

// processIsAlive opens the target process with SYNCHRONIZE rights and calls
// WaitForSingleObject with a zero timeout. WAIT_TIMEOUT (258) means the
// process is still running; WAIT_OBJECT_0 (0) means it has exited.
func processIsAlive(pid int) bool {
	h, err := syscall.OpenProcess(processSynchronize, false, uint32(pid))
	if err != nil {
		return false
	}
	defer syscall.CloseHandle(h)
	result, _ := syscall.WaitForSingleObject(h, 0)
	return result == waitTimeout
}
