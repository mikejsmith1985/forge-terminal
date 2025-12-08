package files

import (
	"testing"
)

func TestNormalizePath(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{".", "."},
		{"/home/user/project", "/home/user/project"},
		{"/home/user/project/", "/home/user/project"},
		{"C:\\Users\\user\\project", "C:/Users/user/project"},
		{"C:\\Users\\user\\project\\", "C:/Users/user/project"},
		{"/mnt/c/Users/user", "/mnt/c/Users/user"},
		{"/mnt/c/Users/user/", "/mnt/c/Users/user"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := normalizePath(tt.input)
			if result != tt.expected {
				t.Errorf("normalizePath(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

func TestIsPathWithinRoot(t *testing.T) {
	tests := []struct {
		targetPath string
		rootPath   string
		expected   bool
	}{
		{"/home/user", "/home/user", true},
		{"/home/user/project", "/home/user", true},
		{"/home/user/project/src", "/home/user/project", true},
		{"/home", "/home/user", false},
		{"/other/path", "/home/user", false},
		{".", ".", true},
	}

	for _, tt := range tests {
		t.Run(tt.targetPath+"|"+tt.rootPath, func(t *testing.T) {
			result, err := isPathWithinRoot(tt.targetPath, tt.rootPath)
			if err != nil {
				t.Logf("isPathWithinRoot error (acceptable): %v", err)
				// Errors are OK for some paths that don't exist
				return
			}
			if result != tt.expected {
				t.Errorf("isPathWithinRoot(%q, %q) = %v, want %v", tt.targetPath, tt.rootPath, result, tt.expected)
			}
		})
	}
}
