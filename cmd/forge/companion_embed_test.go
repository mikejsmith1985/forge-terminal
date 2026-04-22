package main

// companion_embed_test.go — regression guard for the companion PWA embed.
//
// The Forge Companion PWA is served at /companion/ by reading from the embedded
// FS (//go:embed all:web). If the companion files are absent from the embed —
// which happens when cmd/forge/web/companion/ is gitignored or the frontend
// build has not been run — the route silently fails to register and every
// /companion/* request returns 404. This test catches that regression at
// compile time (missing files cause the embed directive to fail) and at test
// time (missing files are explicitly detected with a readable error message).

import (
	"testing"
)

// TestCompanionFilesEmbedded verifies that the three PWA files required for the
// Forge Companion to function are present in the embedded FS. If this test
// fails, run `cd frontend && npm run build` to regenerate them, then ensure
// cmd/forge/web/companion/ is NOT listed in .gitignore.
func TestCompanionFilesEmbedded(t *testing.T) {
	requiredCompanionFiles := []string{
		"web/companion/index.html",
		"web/companion/sw.js",
		"web/companion/manifest.json",
	}

	for _, filePath := range requiredCompanionFiles {
		fileHandle, openErr := embeddedFS.Open(filePath)
		if openErr != nil {
			t.Errorf(
				"companion file %q missing from embedded FS — "+
					"run 'cd frontend && npm run build' and ensure "+
					"cmd/forge/web/companion/ is not in .gitignore: %v",
				filePath, openErr,
			)
			continue
		}
		fileHandle.Close()
	}
}
