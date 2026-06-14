// binding.go — resolves which terminal session a pipeline belongs to (research R9). The
// file watcher is global to the feature directory, so on the first gate we bind the pipeline
// to the session whose working directory is the repository running the pipeline.
package sdd

import "strings"

// SessionInfo is the minimal view of a live terminal session the binder needs.
type SessionInfo struct {
	ID         string
	CurrentDir string
}

// resolveSession returns the id of the session whose current directory is at or below
// repoRoot. The first match wins (v1 assumes a single active pipeline). Returns false when
// no session matches, so the caller can defer binding until a suitable session exists.
func resolveSession(sessions []SessionInfo, repoRoot string) (string, bool) {
	normalizedRoot := normalizeDir(repoRoot)
	for _, session := range sessions {
		sessionDir := normalizeDir(session.CurrentDir)
		if sessionDir == normalizedRoot || strings.HasPrefix(sessionDir, normalizedRoot+"/") {
			return session.ID, true
		}
	}
	return "", false
}

// normalizeDir lowercases drive-letter differences are ignored here; it only unifies path
// separators and strips a trailing slash so comparisons are stable across Windows/POSIX.
func normalizeDir(dir string) string {
	unified := strings.ReplaceAll(dir, "\\", "/")
	return strings.TrimSuffix(unified, "/")
}
