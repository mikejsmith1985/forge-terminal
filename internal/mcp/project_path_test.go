// project_path_test.go — which directory an MCP tool writes into.
//
// This is the bug that made the change-brief gate unusable in practice. The
// project path was the Forge *process's* working directory, which on Windows is
// C:\WINDOWS\system32 whenever Forge is launched from a shortcut. Every tool
// that writes project state — the gate ledger, the brief store — tried to write
// there and was refused by the operating system.
//
// The rule these tests pin: a path is only the project if it looks like one. A
// system directory that happens to be the process's cwd is not an answer, and
// answering with it is worse than admitting we do not know, because the caller
// then fails with a permissions error instead of a clear one.
package mcp

import (
	"os"
	"path/filepath"
	"testing"
)

func TestADirectoryWithAGitRepositoryIsAProject(t *testing.T) {
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))

	if !LooksLikeProjectRoot(projectRoot) {
		t.Error("a directory containing .git is a project root")
	}
}

func TestADirectoryWithForgeStateIsAProject(t *testing.T) {
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".forge"))

	if !LooksLikeProjectRoot(projectRoot) {
		t.Error("a directory Forge already keeps state in is a project root")
	}
}

func TestADirectoryWithAForgeConfigIsAProject(t *testing.T) {
	projectRoot := t.TempDir()
	mustCreateFile(t, filepath.Join(projectRoot, "forge.toml"))

	if !LooksLikeProjectRoot(projectRoot) {
		t.Error("a directory holding forge.toml is a project root")
	}
}

func TestAnEmptyDirectoryIsNotAProject(t *testing.T) {
	// The system directory case, generalised. Nothing marks it as a project, so
	// claiming it is one leads a tool to attempt a write it cannot make.
	if LooksLikeProjectRoot(t.TempDir()) {
		t.Error("a directory with no project markers must not be treated as one")
	}
}

func TestAnAbsentDirectoryIsNotAProject(t *testing.T) {
	if LooksLikeProjectRoot(filepath.Join(t.TempDir(), "no-such-directory")) {
		t.Error("a path that does not exist is not a project root")
	}
}

func TestAnEmptyPathIsNotAProject(t *testing.T) {
	if LooksLikeProjectRoot("") {
		t.Error("an empty path is not a project root")
	}
}

func TestABoundSessionIsPreferredOverTheProcessDirectory(t *testing.T) {
	// The session's own repository is the right answer whenever it is known:
	// the agent is working in a tab, and the tab knows where it is even when the
	// Forge process does not.
	boundRepository := t.TempDir()
	mustCreateDirectory(t, filepath.Join(boundRepository, ".git"))

	processDirectory := t.TempDir()
	mustCreateDirectory(t, filepath.Join(processDirectory, ".git"))

	resolver := NewProjectPathResolver(
		func() string { return boundRepository },
		processDirectory,
	)

	if resolved := resolver(); resolved != boundRepository {
		t.Errorf("want the bound repository %q, got %q", boundRepository, resolved)
	}
}

func TestTheProcessDirectoryIsUsedWhenNoSessionIsBound(t *testing.T) {
	processDirectory := t.TempDir()
	mustCreateDirectory(t, filepath.Join(processDirectory, ".git"))

	resolver := NewProjectPathResolver(func() string { return "" }, processDirectory)

	if resolved := resolver(); resolved != processDirectory {
		t.Errorf("want the process directory %q, got %q", processDirectory, resolved)
	}
}

func TestASystemProcessDirectoryIsRefusedRatherThanReturned(t *testing.T) {
	// The actual bug. Returning it produced "mkdir C:\WINDOWS\system32\.forge:
	// Access is denied", which tells the agent nothing about what went wrong.
	systemDirectory := t.TempDir() // no project markers — stands in for system32

	resolver := NewProjectPathResolver(func() string { return "" }, systemDirectory)

	if resolved := resolver(); resolved != "" {
		t.Errorf("a directory that is not a project must resolve to empty, got %q", resolved)
	}
}

func TestABoundSessionWinsEvenWhenTheProcessDirectoryIsValid(t *testing.T) {
	// Two plausible answers, and the session's is the one the developer means.
	boundRepository := t.TempDir()
	mustCreateDirectory(t, filepath.Join(boundRepository, ".git"))
	processDirectory := t.TempDir()
	mustCreateDirectory(t, filepath.Join(processDirectory, ".git"))

	resolver := NewProjectPathResolver(func() string { return boundRepository }, processDirectory)

	if resolver() == processDirectory {
		t.Error("the session's repository should win over the process directory")
	}
}

func TestABoundPathThatIsNotAProjectIsIgnored(t *testing.T) {
	// A stale binding must not send writes somewhere meaningless.
	processDirectory := t.TempDir()
	mustCreateDirectory(t, filepath.Join(processDirectory, ".git"))

	resolver := NewProjectPathResolver(func() string { return t.TempDir() }, processDirectory)

	if resolved := resolver(); resolved != processDirectory {
		t.Errorf("a bound path with no project markers should be ignored, got %q", resolved)
	}
}

func TestAMissingBindingLookupIsTolerated(t *testing.T) {
	// The resolver is built before any session exists, so a nil lookup is the
	// ordinary state at startup rather than a programming error.
	processDirectory := t.TempDir()
	mustCreateDirectory(t, filepath.Join(processDirectory, ".git"))

	resolver := NewProjectPathResolver(nil, processDirectory)

	if resolved := resolver(); resolved != processDirectory {
		t.Errorf("a nil lookup should fall through to the process directory, got %q", resolved)
	}
}

func mustCreateDirectory(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(path, 0o755); err != nil {
		t.Fatalf("creating %s: %v", path, err)
	}
}

func mustCreateFile(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("creating %s: %v", path, err)
	}
}

// staticProjectPath makes a fixed path look like a resolver, so a test can say
// which project a tool acts on without caring how that is worked out at runtime.
func staticProjectPath(path string) func() string {
	return func() string { return path }
}

func TestTheHomeDirectoryIsNeverAProjectRoot(t *testing.T) {
	// Forge keeps its own state in ~/.forge, so without an explicit guard the
	// walk upwards finds that marker and declares the home directory a project.
	// Project state would then be written into the developer's home instead of
	// their repository — quietly, and everywhere.
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		t.Skip("no home directory on this machine")
	}

	if LooksLikeProjectRoot(homeDirectory) {
		t.Error("the home directory must never be treated as a project root")
	}
}

func TestAPathUnderHomeDoesNotEscapeIntoTheHomeDirectory(t *testing.T) {
	// t.TempDir() lives under the home directory on Windows, which is exactly
	// how this was found.
	if resolved := FindProjectRoot(t.TempDir()); resolved != "" {
		t.Errorf("a temporary directory should not resolve to a project, got %q", resolved)
	}
}

func TestASubdirectoryResolvesToItsProjectRoot(t *testing.T) {
	// A process rarely sits at the root. Answering "not a project" for a path
	// plainly inside one is how the fallback failed in the first place.
	projectRoot := t.TempDir()
	mustCreateDirectory(t, filepath.Join(projectRoot, ".git"))
	nestedPath := filepath.Join(projectRoot, "internal", "deeply", "nested")
	mustCreateDirectory(t, nestedPath)

	if resolved := FindProjectRoot(nestedPath); resolved != projectRoot {
		t.Errorf("want the root %q, got %q", projectRoot, resolved)
	}
}
