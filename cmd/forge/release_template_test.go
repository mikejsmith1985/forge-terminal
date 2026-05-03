package main

import (
	"strings"
	"testing"
)

// TestReleaseScriptTemplate verifies the embedded release script template is
// non-empty and contains the structural landmarks that make it a valid, useful
// release pipeline. The tests are intentionally content-focused: if someone
// accidentally truncates or corrupts the constant, these checks catch it.
func TestReleaseScriptTemplate(t *testing.T) {
	t.Run("template is non-empty", func(t *testing.T) {
		if len(releaseScriptTemplate) == 0 {
			t.Fatal("releaseScriptTemplate is empty — the embedded constant is missing its content")
		}
	})

	t.Run("template contains param block", func(t *testing.T) {
		if !strings.Contains(releaseScriptTemplate, "param(") {
			t.Error("template is missing the PowerShell param() block")
		}
	})

	t.Run("template contains explicit version detection", func(t *testing.T) {
		// The regex that distinguishes '1.2.3' from 'patch'/'minor'/'major' must be present.
		if !strings.Contains(releaseScriptTemplate, `^\d+\.\d+\.\d+$`) {
			t.Error("template is missing the explicit semver detection regex — double-bump protection will not work")
		}
	})

	t.Run("template contains merge-to-main step", func(t *testing.T) {
		if !strings.Contains(releaseScriptTemplate, "git checkout main") {
			t.Error("template is missing the merge-to-main step — tags will land on feature branches")
		}
	})

	t.Run("template contains idempotent tag guard", func(t *testing.T) {
		// The 'git tag -l' guard prevents NativeCommandError when the tag doesn't exist yet.
		if !strings.Contains(releaseScriptTemplate, "git tag -l") {
			t.Error("template is missing the 'git tag -l' guard — re-runs will crash under ErrorActionPreference=Stop")
		}
	})

	t.Run("template contains gh release create", func(t *testing.T) {
		if !strings.Contains(releaseScriptTemplate, "gh release create") {
			t.Error("template is missing the 'gh release create' call — no GitHub Release will be published")
		}
	})

	t.Run("template contains no Windows CRLF line endings", func(t *testing.T) {
		// CRLF in the embedded string would produce a script with double line endings
		// when written to disk on Windows, breaking the PowerShell parser on some versions.
		if strings.Contains(releaseScriptTemplate, "\r\n") {
			t.Error("template contains Windows CRLF line endings — use LF only in the source constant")
		}
	})
}
