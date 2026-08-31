// Per-tool projection of the single embedded Spec Kit stage source onto each AI
// tool's native skill surface. Forge ships the speckit pipeline only for Claude;
// projecting the one authored source per tool — rather than hand-maintaining a
// separate copy for Copilot and Google — is the minimum custom piece justified by
// that framework gap (Article VII), and is what keeps cross-tool parity without
// the three copies drifting apart.
package workflow

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// SpecKitStage is one SDD pipeline stage read from the single embedded source at
// speckit/claude-skills/<id>/SKILL.md. Per-tool surfaces are derived from this;
// no tool's stage file is hand-authored.
type SpecKitStage struct {
	ID   string // e.g. "speckit-specify"
	Body string // full SKILL.md content (frontmatter + markdown)
}

// speckitStageSourceDir is the embedded directory holding the authored stages.
const speckitStageSourceDir = speckitEmbedRoot + "/claude-skills"

// Marker fences for the Spec Kit invocation block embedded into Copilot's
// instructions. Deliberately distinct from the FORGE-SKILLS block (managed by
// deploy-skills.ps1) so the two managed regions never clobber one another.
const (
	specKitMarkerStart = "<!-- FORGE-SPECKIT-START -->"
	specKitMarkerEnd   = "<!-- FORGE-SPECKIT-END -->"
)

// EnumerateSpecKitStages reads every stage from the embedded payload — the single
// authored source of truth for the pipeline. Stages are returned sorted by ID so
// projection output is deterministic.
func EnumerateSpecKitStages() ([]SpecKitStage, error) {
	dirEntries, err := fs.ReadDir(speckitAssets, speckitStageSourceDir)
	if err != nil {
		return nil, err
	}

	var stages []SpecKitStage
	for _, dirEntry := range dirEntries {
		if !dirEntry.IsDir() {
			continue
		}
		stageID := dirEntry.Name()
		skillPath := speckitStageSourceDir + "/" + stageID + "/SKILL.md"
		body, readErr := fs.ReadFile(speckitAssets, skillPath)
		if readErr != nil {
			// A stage directory without a SKILL.md is not a usable stage; skip it.
			continue
		}
		stages = append(stages, SpecKitStage{ID: stageID, Body: string(body)})
	}

	sort.Slice(stages, func(first, second int) bool {
		return stages[first].ID < stages[second].ID
	})
	return stages, nil
}

// specKitStageDestPath returns the project-relative destination for a stage under
// a tool, and whether that tool consumes stages as discrete skill files. Claude
// and Copilot both use a per-skill directory; Google's surface is instruction-based
// and is handled separately, so it reports isSkillFileTool=false here.
func specKitStageDestPath(tool, stageID string) (string, bool) {
	switch tool {
	case "claude":
		return filepath.Join(".claude", "skills", stageID, "SKILL.md"), true
	case "copilot":
		return filepath.Join(".github", "skills", stageID, "SKILL.md"), true
	default:
		return "", false
	}
}

// ProjectSpecKitForTool writes the pipeline stages into a project for the given
// tool, honoring the conflict strategy, and — for Copilot — embeds an invocation
// block into .github/copilot-instructions.md so the stages are discoverable and
// invocable as `skill: <stage>`. Returns the project-relative paths written.
func ProjectSpecKitForTool(projectPath, tool string, conflict FileConflictStrategy) ([]string, error) {
	stages, err := EnumerateSpecKitStages()
	if err != nil {
		return nil, err
	}

	var writtenPaths []string
	for _, stage := range stages {
		relativePath, isSkillFileTool := specKitStageDestPath(tool, stage.ID)
		if !isSkillFileTool {
			continue
		}
		absolutePath := filepath.Join(projectPath, relativePath)

		// Under skip, never disturb a stage file the developer already edited.
		if conflict == ConflictSkip {
			if _, statErr := os.Stat(absolutePath); statErr == nil {
				continue
			}
		}
		if writeErr := writeFileEnsuringDir(absolutePath, stage.Body); writeErr != nil {
			return writtenPaths, writeErr
		}
		writtenPaths = append(writtenPaths, relativePath)
	}

	// Copilot resolves skills by name but also needs the stages surfaced in its
	// instructions so a developer can discover the `skill: <stage>` invocation.
	if tool == "copilot" {
		instructionsRelative, embedErr := embedSpecKitInvocationBlock(projectPath, stages)
		if embedErr != nil {
			return writtenPaths, embedErr
		}
		if instructionsRelative != "" {
			writtenPaths = append(writtenPaths, instructionsRelative)
		}
	}
	return writtenPaths, nil
}

// embedSpecKitInvocationBlock upserts the FORGE-SPECKIT marker block into the
// project's copilot-instructions.md, listing each stage and its `skill: <id>`
// invocation. It reuses upsertMarkerBlock, so re-running never stacks duplicates
// and never disturbs content outside the markers — which is why it is safe under
// any conflict strategy (it manages only its own marker region). Returns the
// project-relative path when the file changed, or "" when already up to date.
func embedSpecKitInvocationBlock(projectPath string, stages []SpecKitStage) (string, error) {
	relativePath := filepath.Join(".github", "copilot-instructions.md")
	absolutePath := filepath.Join(projectPath, relativePath)

	existingContent := ""
	if data, err := os.ReadFile(absolutePath); err == nil {
		existingContent = string(data)
	}

	updatedContent := upsertMarkerBlock(existingContent, buildSpecKitInvocationBody(stages), specKitMarkerStart, specKitMarkerEnd)
	if updatedContent == existingContent {
		return "", nil
	}
	if err := writeFileEnsuringDir(absolutePath, updatedContent); err != nil {
		return "", err
	}
	return relativePath, nil
}

// buildSpecKitInvocationBody renders the Copilot-facing list of pipeline stages
// and how to invoke them. It is derived from the stage IDs, so it stays in
// lockstep with the single source — no separate list to maintain.
func buildSpecKitInvocationBody(stages []SpecKitStage) string {
	var builder strings.Builder
	builder.WriteString("## Spec-Driven Development pipeline\n\n")
	builder.WriteString("Invoke a stage with `skill: <stage-id>`. Every stage reads ")
	builder.WriteString("`.specify/memory/constitution.md` as the binding rules.\n\n")
	for _, stage := range stages {
		builder.WriteString("- `skill: " + stage.ID + "`\n")
	}
	return builder.String()
}
