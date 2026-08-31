// Package workflow — brief_scope.go: deciding which commits owe a brief.
//
// A gate that fires on everything gets bypassed on everything.  If correcting a
// typo in a README demanded a change brief, the habit that would form is
// reaching for FORGE_BYPASS without reading the prompt — and a bypass used by
// reflex is a gate that has quietly stopped working.
//
// So a brief is owed for changes to code, where a decision was made that
// somebody could fail to understand.  Documentation says what was already
// decided.  Generated and vendored files were not written by hand at all, so
// there is no thinking in them to explain.
package workflow

import (
	"path"
	"strings"
)

// sourceExtensions are the file types that carry decisions worth explaining.
var sourceExtensions = map[string]bool{
	".go":   true,
	".js":   true,
	".jsx":  true,
	".ts":   true,
	".tsx":  true,
	".css":  true,
	".html": true,
	".ps1":  true,
	".sh":   true,
	".py":   true,
	".sql":  true,
}

// generatedPathFragments mark files nobody wrote by hand.
//
// Matched as path fragments rather than prefixes because build output appears
// at several depths — `frontend/dist/`, `cmd/forge/web/assets/` — and a prefix
// list would need extending every time the layout moved.
var generatedPathFragments = []string{
	"node_modules/",
	"vendor/",
	"/dist/",
	"/build/",
	"/web/assets/",
	".min.js",
	"-lock.json",
	".lock",
}

// ChangeNeedsBrief reports whether a set of changed paths owes a change brief.
//
// True when any path is source a person wrote.  A change mixing documentation
// with one source file still owes a brief: the source file is where the
// decision lives, and the documentation around it does not excuse it.
//
// @param changedPaths Repository-relative paths, as git reports them.
func ChangeNeedsBrief(changedPaths []string) bool {
	for _, changedPath := range changedPaths {
		if isHandWrittenSource(changedPath) {
			return true
		}
	}
	return false
}

// isHandWrittenSource reports whether one path is source somebody authored.
func isHandWrittenSource(changedPath string) bool {
	normalised := strings.ToLower(strings.ReplaceAll(changedPath, "\\", "/"))

	// Guard clauses first: generated output can carry a source extension, so
	// the exclusions have to win.
	if isGenerated(normalised) {
		return false
	}
	// Spec artefacts are pipeline output, exempted by the same reasoning that
	// exempts them from the documentation-discipline rule.
	if strings.HasPrefix(normalised, "specs/") {
		return false
	}

	return sourceExtensions[path.Ext(normalised)]
}

// isGenerated reports whether a path names machine-produced or vendored content.
func isGenerated(normalisedPath string) bool {
	// A leading separator is added so a fragment like "/dist/" also matches a
	// path that begins with "dist/".
	padded := "/" + normalisedPath

	for _, fragment := range generatedPathFragments {
		if strings.Contains(padded, fragment) {
			return true
		}
	}
	return false
}

// RequiredGatesForChange returns the gates a particular change must record.
//
// Identical to RequiredGates except that the brief is dropped for a change with
// no source in it, so the gate stays credible rather than becoming something to
// route around.
func RequiredGatesForChange(changedPaths []string) []string {
	if ChangeNeedsBrief(changedPaths) {
		return append([]string{}, RequiredGates...)
	}

	gates := make([]string, 0, len(RequiredGates))
	for _, gate := range RequiredGates {
		if gate == GateBriefPublished {
			continue
		}
		gates = append(gates, gate)
	}
	return gates
}

// PreflightForChange evaluates the ticket against the gates a change owes.
//
// Preflight remains the whole-set check for callers with no file list; this is
// what the pre-commit path uses, because it knows what is staged and can
// therefore avoid demanding a brief for a change that contains no decision.
func PreflightForChange(projectRoot string, changedPaths []string) (*PreflightResult, error) {
	return preflightAgainst(projectRoot, RequiredGatesForChange(changedPaths))
}
