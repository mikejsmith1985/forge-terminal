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

// TestClassifyBehavior covers the specs/012 US2/US3 classifier: which gate applies to a
// completing phase, derived purely from the files it touched. Both axes fail safe.
func TestClassifyBehavior(t *testing.T) {
	cases := []struct {
		name                 string
		files                []string
		wantBehaviorChanging bool
		wantUserFacing       bool
		wantExempt           bool // expects a non-empty ExemptReason
	}{
		{"backend code only (not user-visible)", []string{"internal/git/worktree.go"}, true, false, false},
		{"docs only", []string{"specs/012/spec.md", "README.md"}, false, false, true},
		{"test files only", []string{"cmd/forge/foo_test.go", "frontend/src/App.test.jsx"}, false, false, true},
		{"frontend UI source", []string{"frontend/src/components/SddDashboard.jsx"}, true, true, false},
		{"backend that alters terminal/gate output", []string{"cmd/forge/sdd_report_card.go"}, true, true, false},
		{"ambiguous unknown type fails safe to both", []string{"scripts/mystery.xyz"}, true, true, false},
		{"docs plus code is behavior-changing", []string{"specs/012/spec.md", "internal/sdd/orchestrator.go"}, true, false, false},
		{"empty diff is exempt (no work to verify)", []string{}, false, false, true},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := ClassifyBehavior(testCase.files)
			if got.BehaviorChanging != testCase.wantBehaviorChanging {
				t.Errorf("BehaviorChanging = %v, want %v", got.BehaviorChanging, testCase.wantBehaviorChanging)
			}
			if got.UserFacing != testCase.wantUserFacing {
				t.Errorf("UserFacing = %v, want %v", got.UserFacing, testCase.wantUserFacing)
			}
			if (got.ExemptReason != "") != testCase.wantExempt {
				t.Errorf("ExemptReason = %q, want exempt=%v", got.ExemptReason, testCase.wantExempt)
			}
			// A behavior-changing phase must NEVER carry an exemption (FR-009 cannot be claimed for code).
			if got.BehaviorChanging && got.ExemptReason != "" {
				t.Error("behavior-changing classification must not be exempt")
			}
		})
	}
}
