// Tests for the working-directory fallback that protects PTY spawn from
// failing when a tab is restored with a path that no longer exists.
package terminal

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// When the caller passes an empty string we must return an empty string so
// the caller delegates to the process default cwd.
func TestResolveWorkingDir_EmptyInputReturnsEmpty(t *testing.T) {
	if got := resolveWorkingDir(""); got != "" {
		t.Fatalf("expected empty string for empty input, got %q", got)
	}
}

// A valid, existing directory must pass through unchanged so ConPTY /
// exec.Cmd spawns the shell inside the tab's saved directory.
func TestResolveWorkingDir_ExistingDirectoryPassesThrough(t *testing.T) {
	tempDir := t.TempDir()
	got := resolveWorkingDir(tempDir)
	if got != tempDir {
		t.Fatalf("expected %q, got %q", tempDir, got)
	}
}

// A path that doesn't exist MUST be rewritten to "" so the caller falls back
// to the process default cwd. Without this the shell spawn fails and the user
// sees "Cannot Reach Session".
func TestResolveWorkingDir_MissingDirectoryFallsBack(t *testing.T) {
	missingPath := filepath.Join(t.TempDir(), "deleted", "subdir", "gone")
	if got := resolveWorkingDir(missingPath); got != "" {
		t.Fatalf("expected fallback to empty for missing path, got %q", got)
	}
}

// A path that points at a real file (not a directory) must also fall back —
// CreateProcess and exec.Cmd reject it with a platform-specific error.
func TestResolveWorkingDir_FileInsteadOfDirectoryFallsBack(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "this-is-a-file.txt")
	if writeErr := os.WriteFile(filePath, []byte("forge"), 0o600); writeErr != nil {
		t.Fatalf("could not create test file: %v", writeErr)
	}

	if got := resolveWorkingDir(filePath); got != "" {
		t.Fatalf("expected fallback to empty when path is a file, got %q", got)
	}
}

// Windows UNC paths and unreachable network shares must also fall back. We
// use a reserved invalid hostname so the os.Stat call returns an error on
// every platform (the regex-based fallback catches the error regardless of
// whether it's "not found" or a network timeout).
func TestResolveWorkingDir_UnreachableNetworkPathFallsBack(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("UNC paths are Windows-specific")
	}

	uncPath := `\\this-host-does-not-exist.invalid\share\folder`
	if got := resolveWorkingDir(uncPath); got != "" {
		t.Fatalf("expected fallback to empty for unreachable UNC path, got %q", got)
	}
}
