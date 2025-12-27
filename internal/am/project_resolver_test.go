package am

import (
	"os"
	"path/filepath"
	"testing"
)

// =============================================================================
// Project Resolver Tests
// =============================================================================

func TestResolveProjectContext(t *testing.T) {
	t.Run("Returns adhoc for empty path", func(t *testing.T) {
		ctx := ResolveProjectContext("")

		if ctx.Name != "adhoc" {
			t.Errorf("Expected 'adhoc', got '%s'", ctx.Name)
		}
	})

	t.Run("Returns adhoc for non-existent path", func(t *testing.T) {
		ctx := ResolveProjectContext("/non/existent/path/xyz123")

		if ctx.Name != "adhoc" {
			t.Errorf("Expected 'adhoc', got '%s'", ctx.Name)
		}
	})

	t.Run("Detects git repository", func(t *testing.T) {
		// Create temp directory with .git
		tmpDir, err := os.MkdirTemp("", "project-resolver-git-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		// Create .git directory
		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git: %v", err)
		}

		// Create HEAD file with branch ref
		headPath := filepath.Join(gitDir, "HEAD")
		if err := os.WriteFile(headPath, []byte("ref: refs/heads/main\n"), 0644); err != nil {
			t.Fatalf("Failed to create HEAD: %v", err)
		}

		ctx := ResolveProjectContext(tmpDir)

		if ctx.Name == "adhoc" {
			t.Error("Should detect git repo, not return adhoc")
		}
		if ctx.GitBranch != "main" {
			t.Errorf("Expected branch 'main', got '%s'", ctx.GitBranch)
		}
		if ctx.Path != tmpDir {
			t.Errorf("Expected path '%s', got '%s'", tmpDir, ctx.Path)
		}
	})

	t.Run("Detects git repository from subdirectory", func(t *testing.T) {
		// Create temp directory structure
		tmpDir, err := os.MkdirTemp("", "project-resolver-subdir-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		// Create .git directory at root
		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git: %v", err)
		}
		headPath := filepath.Join(gitDir, "HEAD")
		if err := os.WriteFile(headPath, []byte("ref: refs/heads/feature-branch\n"), 0644); err != nil {
			t.Fatalf("Failed to create HEAD: %v", err)
		}

		// Create subdirectory
		subDir := filepath.Join(tmpDir, "src", "pkg")
		if err := os.MkdirAll(subDir, 0755); err != nil {
			t.Fatalf("Failed to create subdir: %v", err)
		}

		ctx := ResolveProjectContext(subDir)

		// Should find parent git repo
		if ctx.GitBranch != "feature-branch" {
			t.Errorf("Expected branch 'feature-branch', got '%s'", ctx.GitBranch)
		}
	})

	t.Run("Uses directory name when no git", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "my-project-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		ctx := ResolveProjectContext(tmpDir)

		// Should use basename (sanitized)
		if ctx.Name == "" || ctx.Name == "adhoc" {
			t.Error("Should use directory basename, not empty or adhoc")
		}
		if ctx.Path != tmpDir {
			t.Errorf("Path should be set to '%s', got '%s'", tmpDir, ctx.Path)
		}
	})

	t.Run("Detects package.json project", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "npm-project-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		// Create package.json
		pkgPath := filepath.Join(tmpDir, "package.json")
		if err := os.WriteFile(pkgPath, []byte(`{"name": "my-npm-project"}`), 0644); err != nil {
			t.Fatalf("Failed to create package.json: %v", err)
		}

		ctx := ResolveProjectContext(tmpDir)

		if ctx.Name == "adhoc" {
			t.Error("Should detect npm project")
		}
	})

	t.Run("Detects go.mod project", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "go-project-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		// Create go.mod
		modPath := filepath.Join(tmpDir, "go.mod")
		if err := os.WriteFile(modPath, []byte("module github.com/user/myproject\n"), 0644); err != nil {
			t.Fatalf("Failed to create go.mod: %v", err)
		}

		ctx := ResolveProjectContext(tmpDir)

		if ctx.Name == "adhoc" {
			t.Error("Should detect Go project")
		}
	})
}

// =============================================================================
// Git Remote Detection Tests
// =============================================================================

func TestDetectGitRemote(t *testing.T) {
	t.Run("Parses GitHub remote", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "git-remote-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		// Create .git/config with remote
		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git: %v", err)
		}

		configContent := `[core]
	repositoryformatversion = 0
[remote "origin"]
	url = git@github.com:mikejsmith1985/forge-terminal.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`
		configPath := filepath.Join(gitDir, "config")
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("Failed to create config: %v", err)
		}

		remote := DetectGitRemote(tmpDir)

		if remote == "" {
			t.Error("Should detect remote")
		}
		if remote != "github.com/mikejsmith1985/forge-terminal" {
			t.Errorf("Expected 'github.com/mikejsmith1985/forge-terminal', got '%s'", remote)
		}
	})

	t.Run("Parses HTTPS remote", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "git-remote-https-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git: %v", err)
		}

		configContent := `[remote "origin"]
	url = https://github.com/user/repo.git
`
		configPath := filepath.Join(gitDir, "config")
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("Failed to create config: %v", err)
		}

		remote := DetectGitRemote(tmpDir)

		if remote != "github.com/user/repo" {
			t.Errorf("Expected 'github.com/user/repo', got '%s'", remote)
		}
	})

	t.Run("Returns empty for no remote", func(t *testing.T) {
		tmpDir, err := os.MkdirTemp("", "git-no-remote-*")
		if err != nil {
			t.Fatalf("Failed to create temp dir: %v", err)
		}
		defer os.RemoveAll(tmpDir)

		gitDir := filepath.Join(tmpDir, ".git")
		if err := os.Mkdir(gitDir, 0755); err != nil {
			t.Fatalf("Failed to create .git: %v", err)
		}

		configContent := `[core]
	repositoryformatversion = 0
`
		configPath := filepath.Join(gitDir, "config")
		if err := os.WriteFile(configPath, []byte(configContent), 0644); err != nil {
			t.Fatalf("Failed to create config: %v", err)
		}

		remote := DetectGitRemote(tmpDir)

		if remote != "" {
			t.Errorf("Expected empty remote, got '%s'", remote)
		}
	})
}

// =============================================================================
// Path Sanitization Tests
// =============================================================================

func TestSanitizeProjectNameForSession(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"simple-project", "simple-project"},
		{"My Project", "my-project"},
		{"project@1.0", "project-1-0"},
		{"path/to/project", "project"},
		{"", "adhoc"},
		{"   ", "adhoc"},
		{"UPPERCASE", "uppercase"},
		{"with.dots.and-dashes", "with-dots-and-dashes"},
		{"emoji🎉project", "emoji-project"},
		{"a--b--c", "a-b-c"}, // Remove consecutive dashes
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := SanitizeProjectNameForSession(tt.input)
			if result != tt.expected {
				t.Errorf("SanitizeProjectNameForSession(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
