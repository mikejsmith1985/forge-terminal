// summary.go — deterministic, generation-free derivation of a decision card's summary and
// flags from a completed phase's own artifacts (FR-017). No model call: every value here is
// read or counted from files, which keeps the card trustworthy and unit-testable in <10ms.
package sdd

import (
	"fmt"
	"strings"
)

// fileSource abstracts reading artifacts so the summarizer can run against real files in
// production and an in-memory map in tests (Article V: 100% mocked unit tests).
type fileSource interface {
	read(relPath string) (string, bool)
	exists(relPath string) bool
}

const (
	checklistPath   = "checklists/requirements.md"
	specPath        = "spec.md"
	uncheckedMarker = "- [ ]"
	clarifyMarker   = "[NEEDS CLARIFICATION"
	maxProducedShown = 5
)

// producedCandidates lists, per phase, the artifacts that phase may have produced. Only
// those that actually exist are reported, so the list reflects reality, not expectation.
var producedCandidates = map[PhaseName][]string{
	PhaseSpecify:       {"spec.md"},
	PhaseClarify:       {"spec.md"},
	PhasePlan:          {"plan.md", "research.md", "data-model.md", "quickstart.md"},
	PhaseTasksGenerate: {"tasks.md"},
	PhaseValidate:      {},
	PhaseImplement:     {},
}

// summarize builds the scannable card content for a completed phase. A missing expected
// artifact yields a single blocking flag (FR-013) rather than a falsely "ready" card.
func summarize(phase PhaseName, src fileSource) PhaseSummary {
	definition, _ := PhaseByName(phase)
	flags := collectFlags(definition, src)
	produced := collectProduced(phase, src)

	return PhaseSummary{
		Headline:      buildHeadline(phase, produced, flags, src),
		ProducedItems: produced,
		Flags:         flags,
	}
}

// collectFlags derives every flag from the artifacts: a missing expected artifact (block),
// unchecked checklist items (warn), and remaining clarification markers (warn).
func collectFlags(definition Phase, src fileSource) []Flag {
	flags := []Flag{}

	if definition.ExpectedArtifact != "" && !hasContent(src, definition.ExpectedArtifact) {
		flags = append(flags, Flag{
			Kind:     FlagMissingArtifact,
			Label:    "missing " + definition.ExpectedArtifact,
			Severity: SeverityBlock,
		})
		return flags // a missing artifact dominates; other counts are not meaningful
	}

	if unchecked := countMarker(src, checklistPath, uncheckedMarker); unchecked > 0 {
		flags = append(flags, Flag{
			Kind:     FlagUncheckedChecklist,
			Label:    fmt.Sprintf("%d checklist items unchecked", unchecked),
			Severity: SeverityWarn,
		})
	}

	if open := countMarker(src, specPath, clarifyMarker); open > 0 {
		flags = append(flags, Flag{
			Kind:     FlagOpenClarification,
			Label:    fmt.Sprintf("%d open clarifications", open),
			Severity: SeverityWarn,
		})
	}

	return flags
}

// collectProduced returns the phase's existing artifacts, capped so the card stays scannable.
func collectProduced(phase PhaseName, src fileSource) []string {
	produced := []string{}
	for _, candidate := range producedCandidates[phase] {
		if src.exists(candidate) {
			produced = append(produced, candidate)
		}
		if len(produced) == maxProducedShown {
			break
		}
	}
	return produced
}

// buildHeadline composes the one-line status. A blocking flag flips it to an "incomplete"
// headline so the developer sees the gap first.
func buildHeadline(phase PhaseName, produced []string, flags []Flag, src fileSource) string {
	title := titleFor(phase)
	for _, flag := range flags {
		if flag.Severity == SeverityBlock {
			return fmt.Sprintf("%s incomplete · %s", title, flag.Label)
		}
	}
	open := countMarker(src, specPath, clarifyMarker)
	return fmt.Sprintf("%s ready · %d produced · %d open clarifications", title, len(produced), open)
}

// titleFor returns a human title for a phase name.
func titleFor(phase PhaseName) string {
	if phase == "" {
		return "Phase"
	}
	return strings.ToUpper(string(phase[:1])) + string(phase[1:])
}

// hasContent reports whether a file exists and is non-empty (whitespace-only counts as empty).
func hasContent(src fileSource, relPath string) bool {
	content, found := src.read(relPath)
	return found && strings.TrimSpace(content) != ""
}

// countMarker counts non-overlapping occurrences of a marker within a file, 0 if absent.
func countMarker(src fileSource, relPath, marker string) int {
	content, found := src.read(relPath)
	if !found {
		return 0
	}
	return strings.Count(content, marker)
}
