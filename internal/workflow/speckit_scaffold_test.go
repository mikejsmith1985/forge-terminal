package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

// TestScaffoldSpecKit_WritesPipeline proves the embedded Spec Kit payload is
// replayed into a project at the dotted paths the tooling expects, and that the
// constitution is NOT among them (it is owned by the manifest's RenderConstitution).
func TestScaffoldSpecKit_WritesPipeline(t *testing.T) {
	projectDir := t.TempDir()

	written, err := ScaffoldSpecKit(projectDir, ConflictOverwrite)
	if err != nil {
		t.Fatalf("ScaffoldSpecKit() error: %v", err)
	}
	if len(written) == 0 {
		t.Fatal("ScaffoldSpecKit() wrote 0 files")
	}

	// A representative script and skill must land at their dotted destinations.
	mustExist := []string{
		filepath.Join(".specify", "scripts", "bash", "setup-plan.sh"),
		filepath.Join(".specify", "templates", "spec-template.md"),
		filepath.Join(".claude", "skills", "speckit-specify", "SKILL.md"),
	}
	for _, rel := range mustExist {
		if _, statErr := os.Stat(filepath.Join(projectDir, rel)); statErr != nil {
			t.Errorf("expected %s to be written, but it is missing", rel)
		}
	}

	// The constitution must NOT be replayed here — the manifest owns it.
	constitutionPath := filepath.Join(projectDir, ".specify", "memory", "constitution.md")
	if _, statErr := os.Stat(constitutionPath); statErr == nil {
		t.Error("ScaffoldSpecKit() wrote constitution.md — it must come from RenderConstitution, not the embedded payload")
	}
}

// TestScaffoldSpecKit_SkipConflict proves an existing file is preserved under
// ConflictSkip rather than overwritten by the embedded copy.
func TestScaffoldSpecKit_SkipConflict(t *testing.T) {
	projectDir := t.TempDir()

	existing := filepath.Join(projectDir, ".specify", "scripts", "bash", "setup-plan.sh")
	if err := os.MkdirAll(filepath.Dir(existing), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(existing, []byte("CUSTOM USER SCRIPT"), 0644); err != nil {
		t.Fatal(err)
	}

	if _, err := ScaffoldSpecKit(projectDir, ConflictSkip); err != nil {
		t.Fatalf("ScaffoldSpecKit() error: %v", err)
	}

	content, _ := os.ReadFile(existing)
	if string(content) != "CUSTOM USER SCRIPT" {
		t.Error("ConflictSkip did not preserve the existing user file")
	}
}

// TestScaffoldProject_IncludesSpecKitPipeline proves a full default scaffold now
// lays down both the embedded pipeline AND the Forge-rendered constitution.
func TestScaffoldProject_IncludesSpecKitPipeline(t *testing.T) {
	projectDir := t.TempDir()

	config := DefaultConfig()
	config.ProjectName = "speckit-pipeline-test"

	if _, err := ScaffoldProject(projectDir, config); err != nil {
		t.Fatalf("ScaffoldProject() error: %v", err)
	}

	// Embedded pipeline present
	if _, err := os.Stat(filepath.Join(projectDir, ".claude", "skills", "speckit-plan", "SKILL.md")); err != nil {
		t.Error("scaffolded project missing speckit-plan skill")
	}
	// Forge constitution present (from the manifest, not the embedded payload)
	if _, err := os.Stat(filepath.Join(projectDir, ".specify", "memory", "constitution.md")); err != nil {
		t.Error("scaffolded project missing Forge-rendered constitution.md")
	}
}
