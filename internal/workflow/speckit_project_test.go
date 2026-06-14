// Tests for the per-tool Spec Kit projection engine (cross-tool SDD, Phase 2 + US1).
// They lock the single-source→per-tool-surface mapping, conflict safety, and the
// Copilot invocation-block embedding.
package workflow

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestEnumerateSpecKitStages_FindsCoreStages verifies the engine reads the whole
// pipeline from the single embedded source, with non-empty stage bodies.
func TestEnumerateSpecKitStages_FindsCoreStages(t *testing.T) {
	stages, err := EnumerateSpecKitStages()
	if err != nil {
		t.Fatalf("EnumerateSpecKitStages returned an error: %v", err)
	}
	if len(stages) < 8 {
		t.Errorf("expected the full pipeline (~10 stages), got %d", len(stages))
	}

	stagesByID := map[string]SpecKitStage{}
	for _, stage := range stages {
		stagesByID[stage.ID] = stage
	}
	for _, wantID := range []string{"speckit-specify", "speckit-plan", "speckit-tasks", "speckit-implement"} {
		stage, found := stagesByID[wantID]
		if !found {
			t.Errorf("expected stage %q in the embedded payload", wantID)
			continue
		}
		if strings.TrimSpace(stage.Body) == "" {
			t.Errorf("stage %q has an empty body", wantID)
		}
	}
}

// TestSpecKitStageDestPath_PerTool locks the source→destination mapping per tool.
func TestSpecKitStageDestPath_PerTool(t *testing.T) {
	cases := []struct {
		tool      string
		wantPath  string
		wantIsDir bool
	}{
		{"claude", filepath.Join(".claude", "skills", "speckit-specify", "SKILL.md"), true},
		{"copilot", filepath.Join(".github", "skills", "speckit-specify", "SKILL.md"), true},
		{"google", "", false},
	}
	for _, testCase := range cases {
		gotPath, isSkillFileTool := specKitStageDestPath(testCase.tool, "speckit-specify")
		if isSkillFileTool != testCase.wantIsDir {
			t.Errorf("tool %q: isSkillFileTool=%v, want %v", testCase.tool, isSkillFileTool, testCase.wantIsDir)
		}
		if gotPath != testCase.wantPath {
			t.Errorf("tool %q: path=%q, want %q", testCase.tool, gotPath, testCase.wantPath)
		}
	}
}

// TestProjectSpecKitForTool_WritesCopilotSkillFiles proves stages project onto
// Copilot's .github/skills/ surface with real content (SC-001/SC-005).
func TestProjectSpecKitForTool_WritesCopilotSkillFiles(t *testing.T) {
	projectDir := t.TempDir()
	writtenPaths, err := ProjectSpecKitForTool(projectDir, "copilot", ConflictOverwrite)
	if err != nil {
		t.Fatalf("ProjectSpecKitForTool returned an error: %v", err)
	}
	if len(writtenPaths) == 0 {
		t.Fatal("expected files to be written, got none")
	}

	specifyPath := filepath.Join(projectDir, ".github", "skills", "speckit-specify", "SKILL.md")
	data, readErr := os.ReadFile(specifyPath)
	if readErr != nil {
		t.Fatalf("expected projected stage at %s: %v", specifyPath, readErr)
	}
	if !strings.Contains(string(data), "speckit-specify") {
		t.Error("projected Copilot stage file is missing its stage content")
	}
}

// TestProjectSpecKitForTool_ConflictSkipPreservesEdits proves ConflictSkip never
// clobbers a developer's edited stage file (FR-008/SC-004).
func TestProjectSpecKitForTool_ConflictSkipPreservesEdits(t *testing.T) {
	projectDir := t.TempDir()
	editedPath := filepath.Join(projectDir, ".github", "skills", "speckit-specify", "SKILL.md")
	if err := os.MkdirAll(filepath.Dir(editedPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(editedPath, []byte("LOCAL EDIT"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := ProjectSpecKitForTool(projectDir, "copilot", ConflictSkip); err != nil {
		t.Fatalf("ProjectSpecKitForTool returned an error: %v", err)
	}

	data, _ := os.ReadFile(editedPath)
	if string(data) != "LOCAL EDIT" {
		t.Errorf("ConflictSkip clobbered an edited stage file; content=%q", string(data))
	}
}

// TestProjectSpecKitForTool_EmbedsCopilotInvocationBlock proves Copilot users get
// a discoverable invocation surface (FR-004): a FORGE-SPECKIT marker block listing
// `skill: <stage>` invocations in copilot-instructions.md.
func TestProjectSpecKitForTool_EmbedsCopilotInvocationBlock(t *testing.T) {
	projectDir := t.TempDir()
	if _, err := ProjectSpecKitForTool(projectDir, "copilot", ConflictOverwrite); err != nil {
		t.Fatalf("ProjectSpecKitForTool returned an error: %v", err)
	}

	instructionsPath := filepath.Join(projectDir, ".github", "copilot-instructions.md")
	data, readErr := os.ReadFile(instructionsPath)
	if readErr != nil {
		t.Fatalf("expected copilot-instructions.md to be written: %v", readErr)
	}
	text := string(data)
	if !strings.Contains(text, "FORGE-SPECKIT-START") {
		t.Error("copilot-instructions.md missing the FORGE-SPECKIT marker block")
	}
	if !strings.Contains(text, "skill: speckit-specify") {
		t.Error("FORGE-SPECKIT block missing the `skill: speckit-specify` invocation")
	}
}
