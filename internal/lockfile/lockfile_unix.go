// +build !windows

package lockfile

import (
	"fmt"
	"os"
	"syscall"
)

// tryLock attempts to acquire an exclusive lock on the file (Unix)
func tryLock(file *os.File) error {
	// Use flock with LOCK_EX (exclusive) and LOCK_NB (non-blocking)
	err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != nil {
		if err == syscall.EWOULDBLOCK {
			return fmt.Errorf("lock already held by another process")
		}
		return fmt.Errorf("failed to lock file: %w", err)
	}
	return nil
}
