//go:build !windows

package main

import (
	"os"
	"syscall"
)

// processIsAlive sends signal 0 to the target PID; the kernel accepts the
// call (no error) only when the process exists and we have permission to
// signal it.
func processIsAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}
