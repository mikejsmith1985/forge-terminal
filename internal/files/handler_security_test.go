package files

import (
	"runtime"
	"testing"
)

func TestFileAccessMode_GetSet(t *testing.T) {
	// Test default mode is restricted
	if getFileAccessMode() {
		t.Error("Expected default mode to be restricted (false)")
	}

	// Test setting unrestricted mode
	SetFileAccessMode(FileAccessUnrestricted)
	if !getFileAccessMode() {
		t.Error("Expected mode to be unrestricted (true) after setting")
	}

	// Test setting restricted mode
	SetFileAccessMode(FileAccessRestricted)
	if getFileAccessMode() {
		t.Error("Expected mode to be restricted (false) after setting")
	}
}

func TestIsPathWithinRoot_UnrestrictedMode(t *testing.T) {
	// Set unrestricted mode
	SetFileAccessMode(FileAccessUnrestricted)
	defer SetFileAccessMode(FileAccessRestricted)

	// Any path should be allowed in unrestricted mode
	testCases := []struct {
		name       string
		targetPath string
		rootPath   string
	}{
		{"absolute vs absolute", "/etc/passwd", "/home/user"},
		{"relative vs absolute", "../etc/passwd", "/home/user"},
		{"windows absolute", "C:\\Windows\\System32", "C:\\Users"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := isPathWithinRoot(tc.targetPath, tc.rootPath)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
			if !allowed {
				t.Errorf("Expected path to be allowed in unrestricted mode: target=%s, root=%s",
					tc.targetPath, tc.rootPath)
			}
		})
	}
}

func TestIsPathWithinRoot_UNCPaths_SameFilesystem(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("UNC path test only runs on Windows")
	}

	SetFileAccessMode(FileAccessRestricted)
	defer SetFileAccessMode(FileAccessRestricted)

	testCases := []struct {
		name       string
		targetPath string
		rootPath   string
		expected   bool
	}{
		{
			name:       "file within UNC root",
			targetPath: "\\\\wsl.localhost\\Ubuntu\\home\\user\\file.txt",
			rootPath:   "\\\\wsl.localhost\\Ubuntu\\home\\user",
			expected:   true,
		},
		{
			name:       "file outside UNC root",
			targetPath: "\\\\wsl.localhost\\Ubuntu\\etc\\passwd",
			rootPath:   "\\\\wsl.localhost\\Ubuntu\\home\\user",
			expected:   false,
		},
		{
			name:       "file in different distro",
			targetPath: "\\\\wsl.localhost\\Debian\\home\\user\\file.txt",
			rootPath:   "\\\\wsl.localhost\\Ubuntu\\home\\user",
			expected:   false,
		},
		{
			name:       "exact same path",
			targetPath: "\\\\wsl.localhost\\Ubuntu\\home\\user",
			rootPath:   "\\\\wsl.localhost\\Ubuntu\\home\\user",
			expected:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := isPathWithinRoot(tc.targetPath, tc.rootPath)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
			if allowed != tc.expected {
				t.Errorf("Expected allowed=%v for target=%s, root=%s, got %v",
					tc.expected, tc.targetPath, tc.rootPath, allowed)
			}
		})
	}
}

func TestIsPathWithinRoot_CrossFilesystem_Restricted(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Cross-filesystem test only runs on Windows")
	}

	SetFileAccessMode(FileAccessRestricted)
	defer SetFileAccessMode(FileAccessRestricted)

	// UNC path with Windows root - should deny in restricted mode
	allowed, err := isPathWithinRoot(
		"\\\\wsl.localhost\\Ubuntu\\home\\user\\file.txt",
		"C:\\Users\\User",
	)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if allowed {
		t.Error("Expected cross-filesystem access to be denied in restricted mode")
	}
}

func TestIsPathWithinRoot_CrossFilesystem_Unrestricted(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Cross-filesystem test only runs on Windows")
	}

	SetFileAccessMode(FileAccessUnrestricted)
	defer SetFileAccessMode(FileAccessRestricted)

	// UNC path with Windows root - should allow in unrestricted mode
	allowed, err := isPathWithinRoot(
		"\\\\wsl.localhost\\Ubuntu\\home\\user\\file.txt",
		"C:\\Users\\User",
	)
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if !allowed {
		t.Error("Expected cross-filesystem access to be allowed in unrestricted mode")
	}
}

func TestIsPathWithinRoot_RegularPaths(t *testing.T) {
	SetFileAccessMode(FileAccessRestricted)
	defer SetFileAccessMode(FileAccessRestricted)

	testCases := []struct {
		name       string
		targetPath string
		rootPath   string
		expected   bool
	}{
		{
			name:       "file within root",
			targetPath: "/home/user/projects/file.txt",
			rootPath:   "/home/user",
			expected:   true,
		},
		{
			name:       "file outside root",
			targetPath: "/etc/passwd",
			rootPath:   "/home/user",
			expected:   false,
		},
		{
			name:       "exact match",
			targetPath: "/home/user",
			rootPath:   "/home/user",
			expected:   true,
		},
		{
			name:       "subdirectory",
			targetPath: "/home/user/projects/sub/deep/file.txt",
			rootPath:   "/home/user/projects",
			expected:   true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := isPathWithinRoot(tc.targetPath, tc.rootPath)
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
			if allowed != tc.expected {
				t.Errorf("Expected allowed=%v for target=%s, root=%s, got %v",
					tc.expected, tc.targetPath, tc.rootPath, allowed)
			}
		})
	}
}
