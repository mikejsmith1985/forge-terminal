// detector_test.go — verifies file-based phase classification, including the content-marker
// rule that distinguishes Clarify from Specify, and that non-artifact files are ignored (FR-016).
package sdd

import "testing"

func TestClassifyArtifact(t *testing.T) {
	cases := []struct {
		name      string
		relPath   string
		content   string
		wantPhase PhaseName
		wantOK    bool
	}{
		{"spec without clarifications is Specify", "spec.md", "# Spec\nrequirements", PhaseSpecify, true},
		{"spec with clarifications is Clarify", "spec.md", "# Spec\n## Clarifications\n### Session", PhaseClarify, true},
		{"plan is Plan", "plan.md", "# Plan", PhasePlan, true},
		{"windows path normalizes", ".\\spec.md", "requirements", PhaseSpecify, true},
		{"checklist is ignored", "checklists/requirements.md", "- [ ] item", "", false},
		{"unrelated file is ignored", "notes.txt", "scratch", "", false},
		{"tasks.md completes the tasks phase", "tasks.md", "- [ ] T001 Do something", PhaseTasksGenerate, true},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			phase, ok := classifyArtifact(testCase.relPath, testCase.content)
			if ok != testCase.wantOK || phase != testCase.wantPhase {
				t.Fatalf("classifyArtifact(%q) = (%q, %v), want (%q, %v)",
					testCase.relPath, phase, ok, testCase.wantPhase, testCase.wantOK)
			}
		})
	}
}
