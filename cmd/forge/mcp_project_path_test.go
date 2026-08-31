// mcp_project_path_test.go — reading the project out of the session bindings.
//
// The binding already exists for the SDD pipeline. What is tested here is that
// the MCP layer reads it, and that the absence of any binding is treated as an
// ordinary state rather than an error — a developer who has not opened a tab in
// a project yet has done nothing wrong.
package main

import (
	"os"
	"path/filepath"
	"testing"
)

// clearPipelines empties the binding map so one test cannot colour another.
func clearPipelines(t *testing.T) {
	t.Helper()

	sddPipelines.Range(func(key, _ any) bool {
		sddPipelines.Delete(key)
		return true
	})
	t.Cleanup(func() {
		sddPipelines.Range(func(key, _ any) bool {
			sddPipelines.Delete(key)
			return true
		})
	})
}

func TestNoBindingReportsNoRepository(t *testing.T) {
	clearPipelines(t)

	if boundRepository := anyBoundRepository(); boundRepository != "" {
		t.Errorf("with nothing bound the answer is empty, got %q", boundRepository)
	}
}

func TestABoundSessionYieldsItsRepository(t *testing.T) {
	clearPipelines(t)

	repositoryRoot := t.TempDir()
	sddPipelines.Store("session-001", &sddPipeline{repoRoot: repositoryRoot})

	if boundRepository := anyBoundRepository(); boundRepository != repositoryRoot {
		t.Errorf("want %q, got %q", repositoryRoot, boundRepository)
	}
}

func TestAPipelineWithNoRepositoryIsSkipped(t *testing.T) {
	// A session can be bound before its repository is known. Returning an empty
	// path would look like an answer and send a write nowhere useful.
	clearPipelines(t)

	repositoryRoot := t.TempDir()
	sddPipelines.Store("session-empty", &sddPipeline{repoRoot: ""})
	sddPipelines.Store("session-real", &sddPipeline{repoRoot: repositoryRoot})

	if boundRepository := anyBoundRepository(); boundRepository != repositoryRoot {
		t.Errorf("the session with a repository should win, got %q", boundRepository)
	}
}

func TestTheResolverPrefersTheBoundRepository(t *testing.T) {
	clearPipelines(t)

	repositoryRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repositoryRoot, ".git"), 0o755); err != nil {
		t.Fatalf("creating the repository marker: %v", err)
	}
	sddPipelines.Store("session-001", &sddPipeline{repoRoot: repositoryRoot})

	if resolved := newMcpProjectPathResolver()(); resolved != repositoryRoot {
		t.Errorf("want the bound repository %q, got %q", repositoryRoot, resolved)
	}
}

func TestTheResolverFallsBackWhenNothingIsBound(t *testing.T) {
	// This test runs from the repository, so the process directory is a valid
	// project and the resolver should say so.
	clearPipelines(t)

	if resolved := newMcpProjectPathResolver()(); resolved == "" {
		t.Error("with no binding, a process directory inside a repository should still resolve")
	}
}
