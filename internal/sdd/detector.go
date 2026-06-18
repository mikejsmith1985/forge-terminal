// detector.go — file-based phase-completion detection for the phases that write an
// artifact under the feature directory (Specify, Clarify, Plan). Validate and Implement
// are report-only/code-producing and are detected via PTY-quiet (detector_ptyquiet.go).
package sdd

import "strings"

// clarificationsMarker is the section a completed Clarify phase adds to spec.md. Its
// presence is what distinguishes a Clarify completion from a Specify completion, since
// both phases write the same file.
const clarificationsMarker = "## Clarifications"

// DetectCompletedPhase classifies a changed feature artifact (feature-relative path plus its
// content) to the phase whose completion it signals, returning false for any file that is
// not a recognized phase artifact. It is the exported entry point the wiring layer calls
// from the file-watcher loop.
func DetectCompletedPhase(featureRelPath, content string) (PhaseName, bool) {
	return classifyArtifact(featureRelPath, content)
}

// classifyArtifact maps a changed file (feature-relative path + its content) to the phase
// it signals completion for. It returns false for any file that is not a recognized phase
// artifact, so editor noise and unrelated files never trigger a card (FR-016).
//
// Detection rules (research R3):
//   - spec.md WITHOUT a Clarifications section  -> Specify complete
//   - spec.md WITH a Clarifications section      -> Clarify complete
//   - plan.md                                    -> Plan complete
func classifyArtifact(relPath, content string) (PhaseName, bool) {
	switch normalizeRel(relPath) {
	case "spec.md":
		if strings.Contains(content, clarificationsMarker) {
			return PhaseClarify, true
		}
		return PhaseSpecify, true
	case "plan.md":
		return PhasePlan, true
	case "tasks.md":
		// tasks.md is produced by /speckit-tasks, which runs between plan and validate.
		return PhaseTasksGenerate, true
	default:
		return "", false
	}
}

// normalizeRel reduces a path to forward slashes so Windows and POSIX inputs compare equal.
func normalizeRel(relPath string) string {
	return strings.TrimPrefix(strings.ReplaceAll(relPath, "\\", "/"), "./")
}
