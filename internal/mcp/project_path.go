// project_path.go — deciding which project an MCP tool is acting on.
//
// This existed as one line — the Forge process's working directory — and that
// line made the change-brief gate unusable in practice. Forge launched from a
// shortcut on Windows has a working directory of C:\WINDOWS\system32, so every
// tool that wrote project state tried to write there and was refused by the
// operating system. The agent saw "Access is denied" and had no way to tell that
// the real problem was Forge pointing at the wrong place entirely.
//
// The process directory was never the right answer anyway. It describes where
// Forge was started, not which project the developer is working in — those are
// the same only by coincidence, and the coincidence stops holding the moment
// Forge is opened from anywhere but a terminal sitting in a repository.
//
// So the session's own repository is asked first. Forge already binds every
// terminal session to its repo root, so nothing new has to be tracked: the tab
// knows where it is even when the process does not.
package mcp

import (
	"os"
	"path/filepath"
	"strings"
)

// projectMarkers are the things whose presence means "somebody works here".
//
// Deliberately few. A longer list would start matching directories that merely
// contain a project rather than being one, and resolving to a parent is a
// quieter, worse failure than resolving to nothing.
var projectMarkers = []string{".git", ".forge", "forge.toml"}

// LooksLikeProjectRoot reports whether a path is inside a project.
//
// The guard the original code lacked. Answering "the process directory" without
// asking this is what produced a permission error from a system folder, and a
// permission error is the least useful way to say "I do not know where you are
// working".
//
// @param candidatePath An absolute path, possibly empty.
func LooksLikeProjectRoot(candidatePath string) bool {
	return FindProjectRoot(candidatePath) != ""
}

// FindProjectRoot walks up from a path until it finds the project it belongs to.
//
// Walking up matters as much as the markers do. A process can sit anywhere
// inside a repository — Go's own test runner starts in the package directory,
// and a developer's shell is usually somewhere below the root — so checking only
// the directory itself would answer "not a project" for a path plainly inside
// one.
//
// Returns empty when no ancestor carries a marker, which is the honest answer
// for a system directory.
//
// @param startPath An absolute path, possibly empty.
func FindProjectRoot(startPath string) string {
	if startPath == "" {
		return ""
	}

	info, err := os.Stat(startPath)
	if err != nil || !info.IsDir() {
		return ""
	}

	// The home directory is never a project, however it looks. Forge keeps its
	// own state in ~/.forge, so without this guard every path under the home
	// directory walks up into it and is declared a project — and project state
	// would then be written into the developer's home rather than their
	// repository. The tests caught this; a user would have caught it later and
	// much more annoyingly.
	homeDirectory, _ := os.UserHomeDir()

	currentPath := startPath
	for {
		if homeDirectory != "" && samePath(currentPath, homeDirectory) {
			return ""
		}
		if hasProjectMarker(currentPath) {
			return currentPath
		}

		parentPath := filepath.Dir(currentPath)
		// Dir() returns its input at the filesystem root, which is where the
		// walk has to stop or it would loop.
		if parentPath == currentPath {
			return ""
		}
		currentPath = parentPath
	}
}

// samePath compares two directory paths as the filesystem would.
//
// Case-insensitive because Windows is, and a comparison that missed the home
// directory over capitalisation would reintroduce the bug it exists to prevent.
func samePath(first, second string) bool {
	return strings.EqualFold(filepath.Clean(first), filepath.Clean(second))
}

// hasProjectMarker reports whether a single directory carries a project marker.
func hasProjectMarker(directoryPath string) bool {
	for _, marker := range projectMarkers {
		if _, err := os.Stat(filepath.Join(directoryPath, marker)); err == nil {
			return true
		}
	}
	return false
}

// NewProjectPathResolver builds the function tools call to find their project.
//
// Returns an empty string when neither source yields a plausible project. That
// is deliberate: a tool told "I do not know" can say so clearly, whereas a tool
// handed a system directory fails later with an operating-system error that
// explains nothing.
//
// @param lookUpBoundRepository Returns the repository the active terminal
//   session is bound to, or empty when nothing is bound. May be nil, which is
//   the ordinary state before any session exists.
// @param processDirectory The Forge process's working directory — a fallback,
//   never a first choice.
func NewProjectPathResolver(lookUpBoundRepository func() string, processDirectory string) func() string {
	return func() string {
		// The session's repository first. The agent is working inside a tab, and
		// the tab is the only thing that knows which project that is.
		if lookUpBoundRepository != nil {
			if boundRoot := FindProjectRoot(lookUpBoundRepository()); boundRoot != "" {
				return boundRoot
			}
		}

		// The root, not the directory itself: a tool writing into a subdirectory
		// would scatter .forge state through the tree.
		return FindProjectRoot(processDirectory)
	}
}
