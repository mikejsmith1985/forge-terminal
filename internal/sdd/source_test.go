// source_test.go — verifies the disk-backed fileSource reads files and distinguishes files
// from directories and missing paths.
package sdd

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDiskFileSource(t *testing.T) {
	base := t.TempDir()
	if err := os.WriteFile(filepath.Join(base, "spec.md"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(base, "contracts"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	source := osFileSource(base)

	if content, ok := source.read("spec.md"); !ok || content != "hello" {
		t.Errorf("read spec.md = (%q, %v), want (hello, true)", content, ok)
	}
	if _, ok := source.read("missing.md"); ok {
		t.Errorf("read missing.md should be false")
	}
	if !source.exists("spec.md") {
		t.Errorf("spec.md should exist")
	}
	if source.exists("contracts") {
		t.Errorf("a directory must not count as an existing file")
	}
}
