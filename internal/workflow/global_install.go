// Global install writes the Forge constitution machine-wide so every CLI tool,
// in every project, inherits the project's binding rules without per-project
// reconstruction. This is the cross-CLI hoist for Spec-Driven Development: the
// constitution is self-contained markdown (unlike the speckit-* skills, which
// depend on a per-project .specify/ tree), so it is the one artifact that is
// safe to install once at the user level.
package workflow

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Marker fences delimit the Forge-managed block inside each CLI tool's global
// instructions file. Content outside the fence is the user's own — never touched.
const (
	constitutionMarkerStart = "<!-- FORGE-CONSTITUTION-START -->"
	constitutionMarkerEnd   = "<!-- FORGE-CONSTITUTION-END -->"
)

// GlobalInstallResult reports what the global constitution install wrote, so the
// caller (and the user) can see exactly which CLI tools were updated.
type GlobalInstallResult struct {
	MasterPath     string   `json:"masterPath"`
	TargetsWritten []string `json:"targetsWritten"`
}

// globalCLITarget describes one CLI tool's machine-wide instructions file —
// the file that tool reads at the start of every session, in every project.
type globalCLITarget struct {
	name    string
	relPath []string // path segments under the home directory
}

// globalCLITargets lists the supported CLI tools' global instruction files.
// Verified machine-wide locations: Claude Code reads ~/.claude/CLAUDE.md,
// GitHub Copilot CLI reads ~/.copilot/copilot-instructions.md, and Gemini CLI
// reads ~/.gemini/GEMINI.md.
func globalCLITargets() []globalCLITarget {
	return []globalCLITarget{
		{name: "claude", relPath: []string{".claude", "CLAUDE.md"}},
		{name: "copilot", relPath: []string{".copilot", "copilot-instructions.md"}},
		{name: "gemini", relPath: []string{".gemini", "GEMINI.md"}},
	}
}

// InstallGlobalConstitution writes the constitution to a master copy under
// ~/.forge and embeds it as an idempotent marker block into every supported CLI
// tool's global instructions file. homeDir is passed in (not resolved here) so
// the logic is unit-testable against a temporary directory.
func InstallGlobalConstitution(homeDir, constitution string) (GlobalInstallResult, error) {
	result := GlobalInstallResult{}

	// 1. Write the canonical master copy the user can edit and tools can reference.
	masterPath := filepath.Join(homeDir, ".forge", "constitution.md")
	if err := writeFileEnsuringDir(masterPath, constitution); err != nil {
		return result, fmt.Errorf("writing master constitution: %w", err)
	}
	result.MasterPath = masterPath

	// 2. Embed the constitution into each CLI tool's global instructions file,
	//    preserving any instructions the user already has there.
	blockBody := constitution
	for _, target := range globalCLITargets() {
		segments := append([]string{homeDir}, target.relPath...)
		targetPath := filepath.Join(segments...)

		existing := ""
		if data, err := os.ReadFile(targetPath); err == nil {
			existing = string(data)
		}

		updated := upsertMarkerBlock(existing, blockBody, constitutionMarkerStart, constitutionMarkerEnd)
		if err := writeFileEnsuringDir(targetPath, updated); err != nil {
			return result, fmt.Errorf("writing %s global instructions: %w", target.name, err)
		}
		result.TargetsWritten = append(result.TargetsWritten, targetPath)
	}

	return result, nil
}

// upsertMarkerBlock inserts or replaces the Forge-managed block (the text between
// startMarker and endMarker) with blockBody, leaving all content outside the
// markers untouched. When the markers are absent it appends a fresh block. This
// is what makes re-running the installer safe — the user's own instructions are
// never clobbered, and the managed block never stacks duplicates.
func upsertMarkerBlock(existingContent, blockBody, startMarker, endMarker string) string {
	managedBlock := startMarker + "\n" + blockBody + "\n" + endMarker

	startIndex := strings.Index(existingContent, startMarker)
	endIndex := strings.Index(existingContent, endMarker)

	// Replace in place when a well-formed existing block is present.
	if startIndex != -1 && endIndex != -1 && endIndex > startIndex {
		before := existingContent[:startIndex]
		after := existingContent[endIndex+len(endMarker):]
		return before + managedBlock + after
	}

	// No existing block: append, separating from any prior content with a blank line.
	if strings.TrimSpace(existingContent) == "" {
		return managedBlock + "\n"
	}
	return strings.TrimRight(existingContent, "\n") + "\n\n" + managedBlock + "\n"
}

// writeFileEnsuringDir creates the parent directory if needed, then writes the
// file. Centralizes the MkdirAll + WriteFile pattern used across the installer.
func writeFileEnsuringDir(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0644)
}
