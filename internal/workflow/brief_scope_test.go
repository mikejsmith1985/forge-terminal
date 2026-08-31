// Package workflow — brief_scope_test.go: which commits actually need a brief.
//
// A gate that fires on everything gets bypassed on everything.  If fixing a
// typo in a README demanded a change brief, the habit that would form is
// reaching for FORGE_BYPASS by reflex — and a bypass used by reflex is a gate
// that has stopped working.
//
// So the brief is required for changes to code, where there is something to
// understand, and not for documentation, spec artefacts, or files nobody wrote
// by hand.
package workflow

import (
	"testing"
)

func TestCodeChangesRequireABrief(t *testing.T) {
	codePaths := []string{
		"internal/workflow/ticket.go",
		"frontend/src/components/ChangeBriefPanel.jsx",
		"cmd/forge/main.go",
		"scripts/local-release.ps1",
	}

	for _, path := range codePaths {
		t.Run(path, func(t *testing.T) {
			if !ChangeNeedsBrief([]string{path}) {
				t.Errorf("%s is code and should require a brief", path)
			}
		})
	}
}

func TestDocumentationOnlyChangesDoNotRequireABrief(t *testing.T) {
	documentationPaths := []string{
		"README.md",
		"CHANGELOG.md",
		"docs/forge-workflow-replication-guide.md",
		"specs/014-comprehension-first-workflow/plan.md",
	}

	for _, path := range documentationPaths {
		t.Run(path, func(t *testing.T) {
			if ChangeNeedsBrief([]string{path}) {
				t.Errorf("%s is documentation and should not require a brief", path)
			}
		})
	}
}

func TestGeneratedAndVendoredFilesDoNotRequireABrief(t *testing.T) {
	// Nobody wrote these by hand, so there is no decision in them for a brief
	// to explain.
	generatedPaths := []string{
		"node_modules/react/index.js",
		"vendor/github.com/example/thing.go",
		"cmd/forge/web/assets/index.COsL6Y-y.js",
		"frontend/dist/assets/index-abc123.js",
		"package-lock.json",
	}

	for _, path := range generatedPaths {
		t.Run(path, func(t *testing.T) {
			if ChangeNeedsBrief([]string{path}) {
				t.Errorf("%s is generated or vendored and should not require a brief", path)
			}
		})
	}
}

func TestAMixedChangeRequiresABrief(t *testing.T) {
	// One real source file among documentation still carries a decision worth
	// explaining, so the presence of code decides it.
	changed := []string{
		"README.md",
		"specs/014-comprehension-first-workflow/tasks.md",
		"internal/workflow/brief.go",
	}

	if !ChangeNeedsBrief(changed) {
		t.Error("a change containing any source file should require a brief")
	}
}

func TestAnEmptyChangeRequiresNothing(t *testing.T) {
	if ChangeNeedsBrief(nil) {
		t.Error("a change touching no files should not require a brief")
	}
	if ChangeNeedsBrief([]string{}) {
		t.Error("a change touching no files should not require a brief")
	}
}

func TestTestFilesRequireABrief(t *testing.T) {
	// A test is code, and a change that only alters tests has still made a
	// decision about what is being proven.
	if !ChangeNeedsBrief([]string{"internal/workflow/brief_test.go"}) {
		t.Error("a test file is source and should require a brief")
	}
}

func TestPreflightForChangeSkipsTheBriefGateOnDocumentation(t *testing.T) {
	projectRoot := t.TempDir()

	recordGateOrFail(t, projectRoot, "task-doc", GateBranchCreated)
	recordGateOrFail(t, projectRoot, "task-doc", GateTestsWritten)
	recordGateOrFail(t, projectRoot, "task-doc", GateTestsPassed)

	result, err := PreflightForChange(projectRoot, []string{"README.md"})
	if err != nil {
		t.Fatalf("preflight should run, got: %v", err)
	}
	if !result.OK {
		t.Fatalf("a documentation-only change should not need a brief, missing: %v", result.MissingGates)
	}
}

func TestPreflightForChangeStillDemandsABriefOnCode(t *testing.T) {
	projectRoot := t.TempDir()

	recordGateOrFail(t, projectRoot, "task-code", GateBranchCreated)
	recordGateOrFail(t, projectRoot, "task-code", GateTestsWritten)
	recordGateOrFail(t, projectRoot, "task-code", GateTestsPassed)

	result, err := PreflightForChange(projectRoot, []string{"internal/workflow/ticket.go"})
	if err != nil {
		t.Fatalf("preflight should run, got: %v", err)
	}
	if result.OK {
		t.Fatal("a code change with no brief must still be refused")
	}
	if !containsGate(result.MissingGates, GateBriefPublished) {
		t.Errorf("the missing gate should be named, got: %v", result.MissingGates)
	}
}
