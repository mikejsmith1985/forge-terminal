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

// BehaviorClassification is the per-phase decision of which verification gates apply
// (specs/012). It is derived purely from the set of files a phase touched.
type BehaviorClassification struct {
	// BehaviorChanging is true when the phase changed executable behavior, so the TDD
	// (Red→Green) gate applies. Ambiguous changes default to true (fail safe).
	BehaviorChanging bool
	// UserFacing is true when the phase changed output a developer sees (a frontend
	// surface OR a backend path that produces user-visible output), so the Playwright
	// UX gate applies. Ambiguous changes default to true (fail safe).
	UserFacing bool
	// ExemptReason is non-empty only when the phase touched exclusively docs and/or
	// test files; it is set by this classifier, never self-asserted by the agent.
	ExemptReason string
}

// ClassifyBehavior decides which verification gates apply to a phase from the set of
// files it touched (specs/012 FR-006/FR-011, research R4). Both axes fail safe: an
// unrecognised, non-doc, non-test file is treated as both behaviour-changing AND
// user-facing, so an uncertain change can skip neither gate. A phase that touched only
// docs and/or tests is exempt (no executable behaviour to verify).
func ClassifyBehavior(touchedFiles []string) BehaviorClassification {
	var behaviorChanging, userFacing bool
	for _, raw := range touchedFiles {
		path := normalizeRel(raw)
		switch {
		case isTestFilePath(path), isDocFilePath(path):
			// Neither gate applies to a test or doc file on its own.
		case isFrontendSourcePath(path), isUserVisibleBackendPath(path):
			behaviorChanging, userFacing = true, true
		case isRecognizedBackendSourcePath(path):
			behaviorChanging = true // executable code, but not a user-visible surface.
		default:
			// Unrecognised non-doc, non-test file: cannot rule out behaviour OR UI — fail safe.
			behaviorChanging, userFacing = true, true
		}
	}
	classification := BehaviorClassification{BehaviorChanging: behaviorChanging, UserFacing: userFacing}
	if !behaviorChanging {
		classification.ExemptReason = "docs/refactor only — no executable behavior changed"
	}
	return classification
}

// isTestFilePath reports whether a path is a test file (Go, frontend, or e2e spec).
func isTestFilePath(path string) bool {
	return strings.HasSuffix(path, "_test.go") ||
		strings.HasSuffix(path, ".test.jsx") || strings.HasSuffix(path, ".test.js") ||
		strings.HasSuffix(path, ".spec.js") || strings.HasSuffix(path, ".spec.ts") ||
		strings.HasPrefix(path, "tests/") || strings.Contains(path, "/tests/")
}

// isDocFilePath reports whether a path is documentation (markdown or under specs/docs).
func isDocFilePath(path string) bool {
	return strings.HasSuffix(path, ".md") ||
		strings.HasPrefix(path, "specs/") || strings.HasPrefix(path, "docs/")
}

// isFrontendSourcePath reports whether a path is a (non-test) frontend UI source file.
func isFrontendSourcePath(path string) bool {
	return strings.HasPrefix(path, "frontend/src/")
}

// isUserVisibleBackendPath reports whether a backend path produces output a developer
// sees — terminal/prompt rendering or the SDD gate/report message producers. This is the
// specs/012 C1 fix: a Go change to these surfaces is user-facing even with no frontend edit.
func isUserVisibleBackendPath(path string) bool {
	return strings.HasPrefix(path, "cmd/forge/sdd_") ||
		strings.HasPrefix(path, "internal/terminal/") ||
		strings.Contains(path, "terminal") || strings.Contains(path, "pty")
}

// isRecognizedBackendSourcePath reports whether a path is recognised backend Go source
// (so it is behaviour-changing) that is not itself a user-visible surface.
func isRecognizedBackendSourcePath(path string) bool {
	if !strings.HasSuffix(path, ".go") {
		return false
	}
	return strings.HasPrefix(path, "cmd/") || strings.HasPrefix(path, "internal/")
}
