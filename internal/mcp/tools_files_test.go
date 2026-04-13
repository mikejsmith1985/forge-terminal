package mcp_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// ── file_read tests ───────────────────────────────────────────────────────────

func TestFileReadTool_ReadsExistingFile(t *testing.T) {
	projectRoot := t.TempDir()
	testContent := "hello from test file"
	testFile := filepath.Join(projectRoot, "test.txt")
	if err := os.WriteFile(testFile, []byte(testContent), 0644); err != nil {
		t.Fatal(err)
	}

	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})
	result := callTool(t, srv, "file_read", map[string]any{"path": "test.txt"})

	if result.IsError {
		t.Fatalf("unexpected tool error: %v", result.Content)
	}
	if len(result.Content) == 0 || result.Content[0].Text != testContent {
		t.Errorf("expected content %q, got %v", testContent, result.Content)
	}
}

func TestFileReadTool_RejectsPathTraversal(t *testing.T) {
	projectRoot := t.TempDir()
	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "file_read", map[string]any{"path": "../outside.txt"})
	if !result.IsError {
		t.Error("expected path traversal to return an error result")
	}
}

func TestFileReadTool_RejectsAbsoluteOutsideRoot(t *testing.T) {
	projectRoot := t.TempDir()
	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})

	// Try to read a system file via absolute path.
	result := callTool(t, srv, "file_read", map[string]any{"path": os.TempDir()})
	if !result.IsError {
		t.Error("expected absolute path outside root to return an error result")
	}
}

// ── file_write tests ──────────────────────────────────────────────────────────

func TestFileWriteTool_WritesFile(t *testing.T) {
	projectRoot := t.TempDir()
	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "file_write", map[string]any{
		"path":    "subdir/new.txt",
		"content": "written by test",
	})
	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}

	written, err := os.ReadFile(filepath.Join(projectRoot, "subdir", "new.txt"))
	if err != nil {
		t.Fatalf("file not found after write: %v", err)
	}
	if string(written) != "written by test" {
		t.Errorf("unexpected file content: %q", string(written))
	}
}

func TestFileWriteTool_RejectsPathTraversal(t *testing.T) {
	projectRoot := t.TempDir()
	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "file_write", map[string]any{
		"path":    "../escape.txt",
		"content": "should not be written",
	})
	if !result.IsError {
		t.Error("expected path traversal write to return an error result")
	}
}

// ── file_list tests ───────────────────────────────────────────────────────────

func TestFileListTool_ListsProjectRoot(t *testing.T) {
	projectRoot := t.TempDir()
	if err := os.WriteFile(filepath.Join(projectRoot, "a.txt"), []byte("a"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, "b.txt"), []byte("b"), 0644); err != nil {
		t.Fatal(err)
	}

	srv := mcp.NewServer("tok", mcp.Dependencies{ProjectPath: projectRoot, WorkflowConfig: workflow.WorkflowConfig{}})

	result := callTool(t, srv, "file_list", map[string]any{})
	if result.IsError {
		t.Fatalf("unexpected error: %v", result.Content)
	}
	if len(result.Content) == 0 {
		t.Fatal("expected content in file_list response")
	}
	text := result.Content[0].Text
	if !contains(text, "a.txt") || !contains(text, "b.txt") {
		t.Errorf("expected both files in listing, got: %s", text)
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// callTool exercises a named tool on the server without going through HTTP.
// It looks up the tool by name and calls Execute directly.
func callTool(t *testing.T, srv *mcp.Server, toolName string, args map[string]any) *mcp.CallToolResult {
	t.Helper()
	result, err := srv.ExecuteTool(toolName, args)
	if err != nil {
		t.Fatalf("tool %q returned unexpected execution error: %v", toolName, err)
	}
	return result
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsRune(s, substr))
}

func containsRune(s, sub string) bool {
	for i := range s {
		if i+len(sub) <= len(s) && s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
