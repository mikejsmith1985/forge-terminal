package lockfile

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLockFileBasic(t *testing.T) {
	// Create temp directory for test
	tmpDir := t.TempDir()
	
	// Acquire lock
	lock1, err := Acquire(tmpDir)
	if err != nil {
		t.Fatalf("Failed to acquire first lock: %v", err)
	}
	defer lock1.Release()
	
	// Verify lockfile exists
	lockPath := filepath.Join(tmpDir, "forge.lock")
	if _, err := os.Stat(lockPath); os.IsNotExist(err) {
		t.Error("Lockfile was not created")
	}
	
	// Try to acquire second lock (should fail)
	lock2, err := Acquire(tmpDir)
	if err == nil {
		lock2.Release()
		t.Fatal("Second lock acquisition should have failed")
	}
	
	// Release first lock
	if err := lock1.Release(); err != nil {
		t.Errorf("Failed to release lock: %v", err)
	}
	
	// Verify lockfile was removed
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Error("Lockfile was not removed after release")
	}
	
	// Now second lock should succeed
	lock3, err := Acquire(tmpDir)
	if err != nil {
		t.Fatalf("Failed to acquire lock after release: %v", err)
	}
	defer lock3.Release()
}

func TestStaleLockfile(t *testing.T) {
	// Create temp directory for test
	tmpDir := t.TempDir()
	lockPath := filepath.Join(tmpDir, "forge.lock")
	
	// Create a stale lockfile with a non-existent PID
	if err := os.WriteFile(lockPath, []byte("999999\n"), 0644); err != nil {
		t.Fatalf("Failed to create stale lockfile: %v", err)
	}
	
	// Should be able to acquire lock (stale lockfile removed)
	lock, err := Acquire(tmpDir)
	if err != nil {
		t.Fatalf("Failed to acquire lock with stale lockfile: %v", err)
	}
	defer lock.Release()
}

func TestConcurrentLockAttempts(t *testing.T) {
	tmpDir := t.TempDir()
	
	// First goroutine acquires lock
	lock1, err := Acquire(tmpDir)
	if err != nil {
		t.Fatalf("Failed to acquire lock: %v", err)
	}
	
	// Launch multiple goroutines trying to acquire lock
	results := make(chan error, 5)
	for i := 0; i < 5; i++ {
		go func() {
			lock, err := Acquire(tmpDir)
			if lock != nil {
				lock.Release()
			}
			results <- err
		}()
	}
	
	// All should fail
	for i := 0; i < 5; i++ {
		select {
		case err := <-results:
			if err == nil {
				t.Error("Concurrent lock acquisition should have failed")
			}
		case <-time.After(2 * time.Second):
			t.Fatal("Timeout waiting for lock attempt")
		}
	}
	
	// Release lock
	lock1.Release()
}
