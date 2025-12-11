// Package am provides tests for project-based naming functionality.
package am

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestSanitizeProjectName tests project name sanitization with comprehensive edge cases.
func TestSanitizeProjectName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "normal project name",
			input: "forge-terminal",
			want:  "forge-terminal",
		},
		{
			name:  "with spaces",
			input: "My Project",
			want:  "my-project",
		},
		{
			name:  "with uppercase",
			input: "ForgeTerminal",
			want:  "forgeterminal",
		},
		{
			name:  "with special characters",
			input: "my-project!@#$%",
			want:  "my-project",
		},
		{
			name:  "path traversal attempt",
			input: "../../../etc/passwd",
			want:  "etc-passwd",
		},
		{
			name:  "empty string",
			input: "",
			want:  "adhoc",
		},
		{
			name:  "only special characters",
			input: "!@#$%^&*()",
			want:  "adhoc",
		},
		{
			name:  "only hyphens",
			input: "---",
			want:  "adhoc",
		},
		{
			name:  "leading and trailing hyphens",
			input: "-my-project-",
			want:  "my-project",
		},
		{
			name:  "very long name",
			input: strings.Repeat("a", 100),
			want:  strings.Repeat("a", 50),
		},
		{
			name:  "unicode characters",
			input: "my-project-💩",
			want:  "my-project",
		},
		{
			name:  "mixed case and special",
			input: "My_Project-2024!",
			want:  "my_project-2024",
		},
		{
			name:  "numbers only",
			input: "12345",
			want:  "12345",
		},
		{
			name:  "hidden file",
			input: ".gitignore",
			want:  "gitignore",
		},
		{
			name:  "windows path",
			input: "C:\\Users\\Project",
			want:  "c-users-project",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeProjectName(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeProjectName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// TestDetectShell tests shell detection from environment.
func TestDetectShell(t *testing.T) {
	tests := []struct {
		name     string
		shellEnv string
		want     string
	}{
		{
			name:     "bash",
			shellEnv: "/bin/bash",
			want:     "bash",
		},
		{
			name:     "zsh",
			shellEnv: "/usr/bin/zsh",
			want:     "zsh",
		},
		{
			name:     "sh",
			shellEnv: "/bin/sh",
			want:     "sh",
		},
		{
			name:     "empty",
			shellEnv: "",
			want:     "unknown",
		},
		{
			name:     "path with spaces",
			shellEnv: "/usr/local/bin/my shell",
			want:     "my shell",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Save original SHELL env var
			originalShell := os.Getenv("SHELL")
			defer os.Setenv("SHELL", originalShell)

			// Set test SHELL env var
			if tt.shellEnv != "" {
				os.Setenv("SHELL", tt.shellEnv)
			} else {
				os.Unsetenv("SHELL")
			}

			got := detectShell()
			if got != tt.want {
				t.Errorf("detectShell() = %q, want %q (SHELL=%q)", got, tt.want, tt.shellEnv)
			}
		})
	}
}

// TestFindGitRoot tests finding git repository root.
func TestFindGitRoot(t *testing.T) {
	// Create temporary directory structure
	tmpDir := t.TempDir()

	// Create a mock git repo structure
	gitRepo := filepath.Join(tmpDir, "my-project")
	gitDir := filepath.Join(gitRepo, ".git")
	subDir := filepath.Join(gitRepo, "src", "pkg")

	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create git dir: %v", err)
	}
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("Failed to create subdir: %v", err)
	}

	tests := []struct {
		name    string
		dir     string
		want    string
		wantErr bool
	}{
		{
			name: "from git root",
			dir:  gitRepo,
			want: gitRepo,
		},
		{
			name: "from subdirectory",
			dir:  subDir,
			want: gitRepo,
		},
		{
			name: "not in git repo",
			dir:  tmpDir,
			want: "",
		},
		{
			name: "empty path",
			dir:  "",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findGitRoot(tt.dir)
			if got != tt.want {
				t.Errorf("findGitRoot(%q) = %q, want %q", tt.dir, got, tt.want)
			}
		})
	}
}

// TestGetGitBranch tests git branch detection.
func TestGetGitBranch(t *testing.T) {
	// Create temporary git repo
	tmpDir := t.TempDir()
	gitDir := filepath.Join(tmpDir, ".git")
	headFile := filepath.Join(gitDir, "HEAD")

	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}

	tests := []struct {
		name        string
		headContent string
		want        string
	}{
		{
			name:        "on main branch",
			headContent: "ref: refs/heads/main\n",
			want:        "main",
		},
		{
			name:        "on develop branch",
			headContent: "ref: refs/heads/develop\n",
			want:        "develop",
		},
		{
			name:        "on feature branch",
			headContent: "ref: refs/heads/feature/new-feature\n",
			want:        "feature/new-feature",
		},
		{
			name:        "detached HEAD (SHA)",
			headContent: "abc123def456789012345678901234567890abcd\n",
			want:        "abc123d",
		},
		{
			name:        "short SHA",
			headContent: "abc123\n",
			want:        "abc123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Write HEAD file
			if err := os.WriteFile(headFile, []byte(tt.headContent), 0644); err != nil {
				t.Fatalf("Failed to write HEAD file: %v", err)
			}

			got := getGitBranch(tmpDir)
			if got != tt.want {
				t.Errorf("getGitBranch(%q) = %q, want %q", tmpDir, got, tt.want)
			}
		})
	}

	// Test when .git doesn't exist
	t.Run("no git repo", func(t *testing.T) {
		noGitDir := t.TempDir()
		got := getGitBranch(noGitDir)
		if got != "" {
			t.Errorf("getGitBranch(no-git-dir) = %q, want empty string", got)
		}
	})

	// Test with empty dir
	t.Run("empty dir", func(t *testing.T) {
		got := getGitBranch("")
		if got != "" {
			t.Errorf("getGitBranch('') = %q, want empty string", got)
		}
	})
}

// TestDetectProject tests project detection from working directory.
func TestDetectProject(t *testing.T) {
	tmpDir := t.TempDir()

	// Create various project structures
	gitRepo := filepath.Join(tmpDir, "git-project")
	gitDir := filepath.Join(gitRepo, ".git")
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create git repo: %v", err)
	}

	nodeProject := filepath.Join(tmpDir, "node-project")
	if err := os.MkdirAll(nodeProject, 0755); err != nil {
		t.Fatalf("Failed to create node project: %v", err)
	}
	packageJSON := filepath.Join(nodeProject, "package.json")
	if err := os.WriteFile(packageJSON, []byte("{}"), 0644); err != nil {
		t.Fatalf("Failed to create package.json: %v", err)
	}

	goProject := filepath.Join(tmpDir, "go-project")
	if err := os.MkdirAll(goProject, 0755); err != nil {
		t.Fatalf("Failed to create go project: %v", err)
	}
	goMod := filepath.Join(goProject, "go.mod")
	if err := os.WriteFile(goMod, []byte("module test\n"), 0644); err != nil {
		t.Fatalf("Failed to create go.mod: %v", err)
	}

	emptyDir := filepath.Join(tmpDir, "empty-dir")
	if err := os.MkdirAll(emptyDir, 0755); err != nil {
		t.Fatalf("Failed to create empty dir: %v", err)
	}

	tests := []struct {
		name       string
		workingDir string
		want       string
	}{
		{
			name:       "git repository",
			workingDir: gitRepo,
			want:       "git-project",
		},
		{
			name:       "node.js project",
			workingDir: nodeProject,
			want:       "node-project",
		},
		{
			name:       "go project",
			workingDir: goProject,
			want:       "go-project",
		},
		{
			name:       "empty directory",
			workingDir: emptyDir,
			want:       "empty-dir",
		},
		{
			name:       "empty path",
			workingDir: "",
			want:       "adhoc",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := detectProject(tt.workingDir)
			if got != tt.want {
				t.Errorf("detectProject(%q) = %q, want %q", tt.workingDir, got, tt.want)
			}
		})
	}
}

// TestGenerateConversationFilename tests filename generation.
func TestGenerateConversationFilename(t *testing.T) {
	tmpDir := t.TempDir()

	logger := &LLMLogger{
		tabID: "test-tab",
		amDir: tmpDir,
	}

	baseTime := time.Date(2025, 12, 11, 14, 30, 0, 0, time.UTC)

	tests := []struct {
		name string
		conv *LLMConversation
		want string
	}{
		{
			name: "with metadata",
			conv: &LLMConversation{
				ConversationID: "conv-1234567890123456789",
				StartTime:      baseTime,
				Metadata: &ConversationMetadata{
					WorkingDirectory: "/home/user/projects/forge-terminal",
				},
			},
			want: "forge-terminal-conv-2025-12-11-1430-12345678.json",
		},
		{
			name: "without metadata",
			conv: &LLMConversation{
				ConversationID: "conv-9876543210987654321",
				StartTime:      baseTime,
				Metadata:       nil,
			},
			want: "adhoc-conv-2025-12-11-1430-98765432.json",
		},
		{
			name: "empty working directory",
			conv: &LLMConversation{
				ConversationID: "conv-1111111111111111111",
				StartTime:      baseTime,
				Metadata: &ConversationMetadata{
					WorkingDirectory: "",
				},
			},
			want: "adhoc-conv-2025-12-11-1430-11111111.json",
		},
		{
			name: "short conversation ID",
			conv: &LLMConversation{
				ConversationID: "conv-123",
				StartTime:      baseTime,
				Metadata: &ConversationMetadata{
					WorkingDirectory: "/home/user/test",
				},
			},
			want: "test-conv-2025-12-11-1430-123.json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := logger.generateConversationFilename(tt.conv)
			if got != tt.want {
				t.Errorf("generateConversationFilename() = %q, want %q", got, tt.want)
			}
		})
	}
}

// TestCaptureMetadata tests metadata capture.
func TestCaptureMetadata(t *testing.T) {
	// Create temporary git repo
	tmpDir := t.TempDir()
	gitDir := filepath.Join(tmpDir, ".git")
	headFile := filepath.Join(gitDir, "HEAD")

	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create .git dir: %v", err)
	}
	if err := os.WriteFile(headFile, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		t.Fatalf("Failed to write HEAD file: %v", err)
	}

	// Save current directory
	originalDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get current directory: %v", err)
	}
	defer os.Chdir(originalDir)

	// Change to test directory
	if err := os.Chdir(tmpDir); err != nil {
		t.Fatalf("Failed to change to test directory: %v", err)
	}

	// Save and set SHELL env var
	originalShell := os.Getenv("SHELL")
	defer os.Setenv("SHELL", originalShell)
	os.Setenv("SHELL", "/bin/bash")

	logger := &LLMLogger{
		tabID: "test-tab",
		amDir: tmpDir,
	}

	metadata := logger.captureMetadata()

	// Verify metadata
	if metadata == nil {
		t.Fatal("captureMetadata() returned nil")
	}

	if metadata.WorkingDirectory != tmpDir {
		t.Errorf("WorkingDirectory = %q, want %q", metadata.WorkingDirectory, tmpDir)
	}

	if metadata.GitBranch != "main" {
		t.Errorf("GitBranch = %q, want %q", metadata.GitBranch, "main")
	}

	if metadata.ShellType != "bash" {
		t.Errorf("ShellType = %q, want %q", metadata.ShellType, "bash")
	}
}

// TestBackwardCompatibilityFileLoading tests that both old and new filename patterns can be loaded.
func TestBackwardCompatibilityFileLoading(t *testing.T) {
	tmpDir := t.TempDir()

	logger := &LLMLogger{
		tabID:         "test-tab-123",
		conversations: make(map[string]*LLMConversation),
		amDir:         tmpDir,
	}

	// Create old format file
	oldFilename := filepath.Join(tmpDir, "llm-conv-test-tab-123-conv-old-123.json")
	oldData := `{"conversationId":"conv-old-123","tabId":"test-tab-123","provider":"github-copilot","complete":true,"endTime":"` + time.Now().Format(time.RFC3339) + `","turns":[]}`
	if err := os.WriteFile(oldFilename, []byte(oldData), 0644); err != nil {
		t.Fatalf("Failed to write old format file: %v", err)
	}

	// Create new format file
	newFilename := filepath.Join(tmpDir, "test-conv-2025-12-11-1430-new-456.json")
	newData := `{"conversationId":"conv-new-456","tabId":"test-tab-123","provider":"claude","complete":true,"endTime":"` + time.Now().Format(time.RFC3339) + `","turns":[],"metadata":{"workingDirectory":"` + tmpDir + `"}}`
	if err := os.WriteFile(newFilename, []byte(newData), 0644); err != nil {
		t.Fatalf("Failed to write new format file: %v", err)
	}

	// Load conversations
	logger.loadConversationsFromDisk()

	// Verify both conversations were loaded
	if len(logger.conversations) != 2 {
		t.Errorf("Expected 2 conversations loaded, got %d", len(logger.conversations))
	}

	// Verify old format loaded
	if _, exists := logger.conversations["conv-old-123"]; !exists {
		t.Error("Old format conversation not loaded")
	}

	// Verify new format loaded
	if _, exists := logger.conversations["conv-new-456"]; !exists {
		t.Error("New format conversation not loaded")
	}

	// Test GetConversations
	allConvs := logger.GetConversations()
	if len(allConvs) != 2 {
		t.Errorf("GetConversations() returned %d conversations, want 2", len(allConvs))
	}

	// Test GetConversation for old format
	oldRetrieved := logger.GetConversation("conv-old-123")
	if oldRetrieved == nil {
		t.Error("GetConversation failed to retrieve old format conversation")
	} else if oldRetrieved.Provider != "github-copilot" {
		t.Errorf("Old conversation provider = %q, want 'github-copilot'", oldRetrieved.Provider)
	}

	// Test GetConversation for new format
	newRetrieved := logger.GetConversation("conv-new-456")
	if newRetrieved == nil {
		t.Error("GetConversation failed to retrieve new format conversation")
	} else if newRetrieved.Provider != "claude" {
		t.Errorf("New conversation provider = %q, want 'claude'", newRetrieved.Provider)
	}
}

// TestConversationSaveAndLoad tests full save/load cycle with new naming.
func TestConversationSaveAndLoad(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a git repo for realistic metadata
	gitDir := filepath.Join(tmpDir, "test-project", ".git")
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		t.Fatalf("Failed to create git dir: %v", err)
	}
	headFile := filepath.Join(gitDir, "HEAD")
	if err := os.WriteFile(headFile, []byte("ref: refs/heads/feature/test\n"), 0644); err != nil {
		t.Fatalf("Failed to write HEAD: %v", err)
	}

	projectDir := filepath.Join(tmpDir, "test-project")

	logger := &LLMLogger{
		tabID:         "test-tab-789",
		conversations: make(map[string]*LLMConversation),
		amDir:         tmpDir,
	}

	// Create conversation with metadata
	conv := &LLMConversation{
		ConversationID: "conv-1234567890123456789",
		TabID:          "test-tab-789",
		Provider:       "github-copilot",
		CommandType:    "ask",
		StartTime:      time.Date(2025, 12, 11, 15, 45, 0, 0, time.UTC),
		Turns: []ConversationTurn{
			{
				Role:      "user",
				Content:   "test question",
				Timestamp: time.Now(),
			},
		},
		Complete: false,
		Metadata: &ConversationMetadata{
			WorkingDirectory: projectDir,
			GitBranch:        "feature/test",
			ShellType:        "zsh",
		},
	}

	// Save conversation
	logger.saveConversation(conv)

	// Verify file was created with correct name
	expectedFilename := "test-project-conv-2025-12-11-1545-12345678.json"
	expectedPath := filepath.Join(tmpDir, expectedFilename)

	if _, err := os.Stat(expectedPath); os.IsNotExist(err) {
		t.Errorf("Expected file %q was not created", expectedFilename)
		
		// List what files were created
		files, _ := os.ReadDir(tmpDir)
		t.Logf("Files in directory:")
		for _, f := range files {
			t.Logf("  - %s", f.Name())
		}
	}

	// Create new logger and load from disk
	logger2 := &LLMLogger{
		tabID:         "test-tab-789",
		conversations: make(map[string]*LLMConversation),
		amDir:         tmpDir,
	}

	logger2.loadConversationsFromDisk()

	// Verify conversation was loaded
	loaded := logger2.GetConversation("conv-1234567890123456789")
	if loaded == nil {
		t.Fatal("Conversation was not loaded from disk")
	}

	// Verify all fields
	if loaded.Provider != "github-copilot" {
		t.Errorf("Provider = %q, want 'github-copilot'", loaded.Provider)
	}
	if loaded.Metadata == nil {
		t.Fatal("Metadata is nil")
	}
	if loaded.Metadata.WorkingDirectory != projectDir {
		t.Errorf("WorkingDirectory = %q, want %q", loaded.Metadata.WorkingDirectory, projectDir)
	}
	if loaded.Metadata.GitBranch != "feature/test" {
		t.Errorf("GitBranch = %q, want 'feature/test'", loaded.Metadata.GitBranch)
	}
	if loaded.Metadata.ShellType != "zsh" {
		t.Errorf("ShellType = %q, want 'zsh'", loaded.Metadata.ShellType)
	}
	if len(loaded.Turns) != 1 {
		t.Errorf("Turns count = %d, want 1", len(loaded.Turns))
	}
}

// TestGetProjectName tests the GetProjectName method on LLMConversation.
func TestGetProjectName(t *testing.T) {
	tests := []struct {
		name string
		conv *LLMConversation
		want string
	}{
		{
			name: "with metadata",
			conv: &LLMConversation{
				Metadata: &ConversationMetadata{
					WorkingDirectory: "/home/user/projects/my-app",
				},
			},
			want: "my-app",
		},
		{
			name: "without metadata",
			conv: &LLMConversation{
				Metadata: nil,
			},
			want: "adhoc",
		},
		{
			name: "empty working directory",
			conv: &LLMConversation{
				Metadata: &ConversationMetadata{
					WorkingDirectory: "",
				},
			},
			want: "adhoc",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.conv.GetProjectName()
			if got != tt.want {
				t.Errorf("GetProjectName() = %q, want %q", got, tt.want)
			}
		})
	}
}
