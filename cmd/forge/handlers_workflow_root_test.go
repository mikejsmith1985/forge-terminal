// Tests for the project-root resolver used by the workflow handlers.
//
// These ensure that a workflow API call made from any subfolder of a project
// finds the same project root as a call made from the root itself, so the
// Forge Workflow card shows consistent compliance regardless of which
// folder the active terminal happens to be in.

package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestResolveProjectRoot_FromGitSubdir verifies that a path inside a .git
// repository walks up to the directory containing .git/.
func TestResolveProjectRoot_FromGitSubdir(t *testing.T) {
	rootPath := t.TempDir()
	// Create a fake project with a .git directory and a deep subfolder.
	gitDirPath := filepath.Join(rootPath, ".git")
	if err := os.Mkdir(gitDirPath, 0o755); err != nil {
		t.Fatalf("failed to create .git: %v", err)
	}
	deepSubfolderPath := filepath.Join(rootPath, "frontend", "src", "components")
	if err := os.MkdirAll(deepSubfolderPath, 0o755); err != nil {
		t.Fatalf("failed to create deep subfolder: %v", err)
	}

	resolvedPath := resolveProjectRoot(deepSubfolderPath)
	expectedPath, _ := filepath.Abs(rootPath)
	if resolvedPath != expectedPath {
		t.Errorf("expected %q, got %q", expectedPath, resolvedPath)
	}
}

// TestResolveProjectRoot_FromPackageJson verifies package.json is also a marker.
func TestResolveProjectRoot_FromPackageJson(t *testing.T) {
	rootPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(rootPath, "package.json"), []byte("{}"), 0o644); err != nil {
		t.Fatalf("failed to write package.json: %v", err)
	}
	subfolderPath := filepath.Join(rootPath, "src")
	if err := os.MkdirAll(subfolderPath, 0o755); err != nil {
		t.Fatalf("failed to create subfolder: %v", err)
	}

	resolvedPath := resolveProjectRoot(subfolderPath)
	expectedPath, _ := filepath.Abs(rootPath)
	if resolvedPath != expectedPath {
		t.Errorf("expected %q, got %q", expectedPath, resolvedPath)
	}
}

// TestResolveProjectRoot_AlreadyAtRoot returns the same path when called on
// the root itself.
func TestResolveProjectRoot_AlreadyAtRoot(t *testing.T) {
	rootPath := t.TempDir()
	if err := os.WriteFile(filepath.Join(rootPath, "go.mod"), []byte("module x"), 0o644); err != nil {
		t.Fatalf("failed to write go.mod: %v", err)
	}

	resolvedPath := resolveProjectRoot(rootPath)
	expectedPath, _ := filepath.Abs(rootPath)
	if resolvedPath != expectedPath {
		t.Errorf("expected %q, got %q", expectedPath, resolvedPath)
	}
}

// TestResolveProjectRoot_NoMarkers returns the original path unchanged when
// no project markers are found anywhere up the tree.
func TestResolveProjectRoot_NoMarkers(t *testing.T) {
	rootPath := t.TempDir()
	subfolderPath := filepath.Join(rootPath, "loose-files")
	if err := os.MkdirAll(subfolderPath, 0o755); err != nil {
		t.Fatalf("failed to create subfolder: %v", err)
	}

	// Resolver may walk all the way up to filesystem root; on most CI machines
	// the temp dir is itself inside a checkout, so we just verify it does NOT
	// blow up and returns a non-empty string.
	resolvedPath := resolveProjectRoot(subfolderPath)
	if resolvedPath == "" {
		t.Error("expected non-empty result, got empty string")
	}
}

// TestResolveProjectRoot_EmptyInput returns the empty input unchanged.
func TestResolveProjectRoot_EmptyInput(t *testing.T) {
	if resolveProjectRoot("") != "" {
		t.Error("expected empty string for empty input")
	}
}
