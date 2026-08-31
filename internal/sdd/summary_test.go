// summary_test.go — golden-input tests for the deterministic summarizer (FR-017): checklist
// counting, clarification markers, and the blocking missing-artifact flag (FR-013).
package sdd

import (
	"strings"
	"testing"
)

// mapFileSource is an in-memory fileSource so the summarizer runs with zero disk I/O.
type mapFileSource map[string]string

func (m mapFileSource) read(relPath string) (string, bool) { content, ok := m[relPath]; return content, ok }
func (m mapFileSource) exists(relPath string) bool         { _, ok := m[relPath]; return ok }

func TestSummarize_PlanReadyWithUncheckedChecklist(t *testing.T) {
	src := mapFileSource{
		"plan.md":                    "# Plan\nready",
		"research.md":                "# Research",
		"checklists/requirements.md": "- [x] done\n- [ ] todo one\n- [ ] todo two",
		"spec.md":                    "# Spec\nno markers",
	}

	summary := summarize(PhasePlan, src)

	if !strings.HasPrefix(summary.Headline, "Plan ready") {
		t.Errorf("headline = %q, want it to start with 'Plan ready'", summary.Headline)
	}
	if got := flagLabel(summary, FlagUncheckedChecklist); got != "2 checklist items unchecked" {
		t.Errorf("unchecked flag = %q, want '2 checklist items unchecked'", got)
	}
	if !containsItem(summary.ProducedItems, "plan.md") {
		t.Errorf("produced items %v should include plan.md", summary.ProducedItems)
	}
}

func TestSummarize_MissingArtifactBlocks(t *testing.T) {
	summary := summarize(PhasePlan, mapFileSource{}) // no plan.md

	flag := findFlag(summary, FlagMissingArtifact)
	if flag == nil {
		t.Fatalf("expected a missing-artifact flag, got %+v", summary.Flags)
	}
	if flag.Severity != SeverityBlock {
		t.Errorf("missing-artifact severity = %q, want block", flag.Severity)
	}
	if !strings.Contains(summary.Headline, "incomplete") {
		t.Errorf("headline = %q, want it to signal 'incomplete'", summary.Headline)
	}
}

func TestSummarize_OpenClarificationsFlagged(t *testing.T) {
	src := mapFileSource{"spec.md": "FR-006 [NEEDS CLARIFICATION: auth?] and more"}

	summary := summarize(PhaseSpecify, src)

	if findFlag(summary, FlagOpenClarification) == nil {
		t.Errorf("expected an open-clarification flag, got %+v", summary.Flags)
	}
}

func TestSummarize_CleanSpecHasNoFlags(t *testing.T) {
	summary := summarize(PhaseSpecify, mapFileSource{"spec.md": "# Spec\nclean and complete"})

	if len(summary.Flags) != 0 {
		t.Errorf("expected no flags for a clean spec, got %+v", summary.Flags)
	}
}

// --- test helpers ---

func findFlag(summary PhaseSummary, kind FlagKind) *Flag {
	for index := range summary.Flags {
		if summary.Flags[index].Kind == kind {
			return &summary.Flags[index]
		}
	}
	return nil
}

func flagLabel(summary PhaseSummary, kind FlagKind) string {
	if flag := findFlag(summary, kind); flag != nil {
		return flag.Label
	}
	return ""
}

func containsItem(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
