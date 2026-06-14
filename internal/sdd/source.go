// source.go — the production fileSource: reads a feature's artifacts from disk. Tests use
// an in-memory implementation instead, so the summarizer never touches the filesystem there.
package sdd

import (
	"os"
	"path/filepath"
)

// osFileSource returns a fileSource rooted at a feature directory on disk.
func osFileSource(baseDir string) fileSource {
	return diskFileSource{baseDir: baseDir}
}

// diskFileSource reads artifacts relative to a feature directory.
type diskFileSource struct {
	baseDir string
}

// read returns the file's content, or false when it cannot be read.
func (source diskFileSource) read(relPath string) (string, bool) {
	raw, err := os.ReadFile(filepath.Join(source.baseDir, filepath.FromSlash(relPath)))
	if err != nil {
		return "", false
	}
	return string(raw), true
}

// exists reports whether the relative path is an existing regular file.
func (source diskFileSource) exists(relPath string) bool {
	info, err := os.Stat(filepath.Join(source.baseDir, filepath.FromSlash(relPath)))
	return err == nil && !info.IsDir()
}
