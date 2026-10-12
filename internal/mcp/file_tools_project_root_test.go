// file_tools_project_root_test.go — file tools act on the calling tab's project, never Forge's launch folder.
//
// The defect these tests pin: file_read, file_write and file_list were handed
// the Forge process's working directory once, at startup. Forge opened from a
// Windows shortcut starts in C:\WINDOWS\system32, so a relative path from an
// agent resolved into the system folder. The fix routes the file tools through
// the same per-call, per-session project resolver the workflow tools already
// use, and refuses outright when no project can be identified.
package mcp_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/mcp"
)

// createDirectoryForTest makes a directory tree or fails the test.
func createDirectoryForTest(t *testing.T, directoryPath string) {
	t.Helper()
	if err := os.MkdirAll(directoryPath, 0o755); err != nil {
		t.Fatal(err)
	}
}

// buildServerWithNoIdentifiableProject mimics Forge launched from system32 with no
// tab bound to a repository: the resolver finds nothing, and the startup
// directory is somewhere nobody works.
func buildServerWithNoIdentifiableProject(launchDirectory string) *mcp.Server {
	return mcp.NewServer("test-token", mcp.Dependencies{
		ProjectPath:               launchDirectory,
		ProjectPathFunc:           func() string { return "" },
		ProjectPathForSessionFunc: func(string) string { return "" },
	})
}

func TestFileListRefusesWhenNoProjectCanBeIdentified(t *testing.T) {
	launchDirectory := t.TempDir()
	createDirectoryForTest(t, filepath.Join(launchDirectory, "system-file-marker"))
	srv := buildServerWithNoIdentifiableProject(launchDirectory)

	result := callTool(t, srv, "file_list", map[string]any{"path": "."})

	if !result.IsError {
		t.Fatalf("expected a refusal, but the launch directory was listed: %v", result.Content)
	}
	if strings.Contains(result.Content[0].Text, "system-file-marker") {
		t.Fatalf("the launch directory leaked into the listing: %q", result.Content[0].Text)
	}
}

func TestFileWriteRefusesWhenNoProjectCanBeIdentified(t *testing.T) {
	launchDirectory := t.TempDir()
	srv := buildServerWithNoIdentifiableProject(launchDirectory)

	result := callTool(t, srv, "file_write", map[string]any{"path": "stray.txt", "content": "x"})

	if !result.IsError {
		t.Fatal("expected a refusal when no project can be identified")
	}
	if _, err := os.Stat(filepath.Join(launchDirectory, "stray.txt")); err == nil {
		t.Fatal("a file was written into the launch directory")
	}
}

func TestFileToolsResolveTheCallingTabsProject(t *testing.T) {
	sessionProject := t.TempDir()
	createDirectoryForTest(t, filepath.Join(sessionProject, ".git"))
	if err := os.WriteFile(filepath.Join(sessionProject, "notes.txt"), []byte("from the tab"), 0o644); err != nil {
		t.Fatal(err)
	}
	srv := mcp.NewServer("test-token", mcp.Dependencies{
		ProjectPath:     t.TempDir(),
		ProjectPathFunc: func() string { return "" },
		ProjectPathForSessionFunc: func(sessionID string) string {
			if sessionID == "tab-1" {
				return sessionProject
			}
			return ""
		},
	})

	result := callTool(t, srv, "file_read", map[string]any{"path": "notes.txt", "sessionId": "tab-1"})

	if result.IsError || result.Content[0].Text != "from the tab" {
		t.Fatalf("expected the tab's project file, got: %v", result.Content)
	}
}
