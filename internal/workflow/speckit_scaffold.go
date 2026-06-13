// Spec Kit scaffolding replays the embedded GitHub Spec Kit pipeline (the
// .specify/ payload and the speckit-* agent skills) into newly created projects.
// Embedding makes the pipeline available offline — end users creating a project
// through Forge Terminal get the full Spec-Driven Development workflow without
// needing Python, uv, or the specify CLI installed.
package workflow

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// speckitAssets holds the vendored Spec Kit payload. The `all:` prefix is
// required so dotfiles inside the tree (e.g. extensions/.registry) are embedded.
// Assets are stored under non-dotted directory names (specify/, claude-skills/)
// and mapped back to their dotted destinations at write time.
//
//go:embed all:speckit
var speckitAssets embed.FS

// speckitEmbedRoot is the top-level embedded directory name.
const speckitEmbedRoot = "speckit"

// speckitDestPath maps an embedded asset path to its project-relative
// destination, translating the stored non-dotted directory names back to the
// dotted paths the Spec Kit tooling and Claude Code expect.
func speckitDestPath(embeddedPath string) string {
	relative := strings.TrimPrefix(embeddedPath, speckitEmbedRoot+"/")

	switch {
	case strings.HasPrefix(relative, "specify/"):
		return filepath.Join(".specify", strings.TrimPrefix(relative, "specify/"))
	case strings.HasPrefix(relative, "claude-skills/"):
		return filepath.Join(".claude", "skills", strings.TrimPrefix(relative, "claude-skills/"))
	default:
		return relative
	}
}

// ScaffoldSpecKit writes the embedded Spec Kit pipeline into a project directory,
// honoring the conflict strategy, and returns the project-relative paths written.
// The constitution is deliberately excluded from the embedded payload — it is
// rendered per-project by RenderConstitution so each project's rules stay current.
func ScaffoldSpecKit(projectPath string, conflict FileConflictStrategy) ([]string, error) {
	var writtenPaths []string

	walkErr := fs.WalkDir(speckitAssets, speckitEmbedRoot, func(assetPath string, dirEntry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if dirEntry.IsDir() {
			return nil
		}

		destinationRelative := speckitDestPath(assetPath)
		destinationAbsolute := filepath.Join(projectPath, destinationRelative)

		// Under skip strategy, never disturb a file the user already has.
		if conflict == ConflictSkip {
			if _, statErr := os.Stat(destinationAbsolute); statErr == nil {
				return nil
			}
		}

		fileBytes, readErr := speckitAssets.ReadFile(assetPath)
		if readErr != nil {
			return readErr
		}

		if mkdirErr := os.MkdirAll(filepath.Dir(destinationAbsolute), 0o755); mkdirErr != nil {
			return mkdirErr
		}

		// Shell scripts must be executable so the pipeline can run them directly.
		filePermission := os.FileMode(0o644)
		if strings.HasSuffix(destinationRelative, ".sh") {
			filePermission = 0o755
		}

		if writeErr := os.WriteFile(destinationAbsolute, fileBytes, filePermission); writeErr != nil {
			return writeErr
		}

		writtenPaths = append(writtenPaths, destinationRelative)
		return nil
	})

	return writtenPaths, walkErr
}
