package lockfile

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// LockFile represents an application instance lock
type LockFile struct {
	path string
	file *os.File
}

// Acquire creates and locks a lockfile to prevent multiple instances
// Returns error if another instance is already running
func Acquire(lockDir string) (*LockFile, error) {
	return AcquireWithFileName(lockDir, "forge.lock")
}

// AcquireWithFileName creates and locks a specific lockfile
func AcquireWithFileName(lockDir, fileName string) (*LockFile, error) {
	if err := os.MkdirAll(lockDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create lock directory: %w", err)
	}

	lockPath := filepath.Join(lockDir, fileName)

	// Try to open/create the lockfile
	file, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open lockfile: %w", err)
	}

	// Try to acquire an exclusive lock (non-blocking)
	// On Windows, this uses LockFileEx; on Unix, it uses flock
	if err := tryLock(file); err != nil {
		file.Close()
		
		// Check if the process in the lockfile is actually running
		if isStale(lockPath) {
			// Lockfile is stale, remove it and retry
			os.Remove(lockPath)
			return AcquireWithFileName(lockDir, fileName)
		}
		
		return nil, fmt.Errorf("another instance of Forge Terminal is already running (PID in %s)", lockPath)
	}

	// Write our PID to the lockfile
	pid := os.Getpid()
	if err := file.Truncate(0); err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to truncate lockfile: %w", err)
	}
	if _, err := file.Seek(0, 0); err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to seek lockfile: %w", err)
	}
	if _, err := file.WriteString(fmt.Sprintf("%d\n", pid)); err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to write PID to lockfile: %w", err)
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to sync lockfile: %w", err)
	}

	return &LockFile{
		path: lockPath,
		file: file,
	}, nil
}

// Release removes the lockfile and releases the lock
func (lf *LockFile) Release() error {
	if lf.file != nil {
		// Unlock is implicit when closing on Unix, explicit on Windows
		lf.file.Close()
		lf.file = nil
	}
	
	// Remove the lockfile
	if err := os.Remove(lf.path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove lockfile: %w", err)
	}
	
	return nil
}

// isStale checks if the lockfile contains a PID of a non-running process
func isStale(lockPath string) bool {
	data, err := os.ReadFile(lockPath)
	if err != nil {
		return false
	}
	
	pidStr := strings.TrimSpace(string(data))
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return false
	}
	
	// Check if the process is still running
	process, err := os.FindProcess(pid)
	if err != nil {
		// Process doesn't exist
		return true
	}
	
	// On Unix, os.FindProcess always succeeds, so we need to send signal 0 to test
	// On Windows, os.FindProcess fails if the process doesn't exist
	err = process.Signal(syscall.Signal(0))
	if err != nil {
		// Process is not running
		return true
	}
	
	return false
}
