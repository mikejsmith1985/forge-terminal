// +build windows

package lockfile

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	procLockFileEx   = kernel32.NewProc("LockFileEx")
	procUnlockFileEx = kernel32.NewProc("UnlockFileEx")
)

const (
	LOCKFILE_EXCLUSIVE_LOCK   = 2
	LOCKFILE_FAIL_IMMEDIATELY = 1
)

// tryLock attempts to acquire an exclusive lock on the file (Windows)
func tryLock(file *os.File) error {
	// Get the Windows file handle
	handle := syscall.Handle(file.Fd())
	
	var overlapped syscall.Overlapped
	
	// LockFileEx flags: exclusive + fail immediately (non-blocking)
	flags := uint32(LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY)
	
	// Lock the entire file (max uint32 bytes)
	ret, _, err := procLockFileEx.Call(
		uintptr(handle),
		uintptr(flags),
		uintptr(0),           // reserved
		uintptr(0xFFFFFFFF),  // nNumberOfBytesToLockLow
		uintptr(0xFFFFFFFF),  // nNumberOfBytesToLockHigh
		uintptr(unsafe.Pointer(&overlapped)),
	)
	
	if ret == 0 {
		if err != nil && err != syscall.Errno(0) {
			return fmt.Errorf("failed to lock file: %w", err)
		}
		return fmt.Errorf("failed to lock file")
	}
	
	return nil
}
