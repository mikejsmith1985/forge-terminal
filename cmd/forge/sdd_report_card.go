// sdd_report_card.go — builds the concise phase report card shown at the gate
// (specs/010-sdd-authoritative-state, US3). The card replaces the wall of verbose
// Markdown with scannable groups: files touched (with +/- line counts), a scope
// summary, and the command-emitted decisions.
//
// "Files touched" is scoped to the phase execution window (FR-014): we snapshot the
// full working tree (tracked + untracked) as a git tree object at phase start and
// diff it against a second snapshot at phase completion. The snapshots use a private
// GIT_INDEX_FILE so the developer's real staging area is never touched.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// sddReportCardMaxFiles caps the file list shown on the card so the essential content
// stays scannable (FR-008); the remainder is summarised as "+N more".
const sddReportCardMaxFiles = 8

// sddFileChange is one file touched during a phase. Added/Removed are nil when the
// magnitude is unavailable (e.g. a binary file), per FR-013 — the file is still listed.
type sddFileChange struct {
	Path    string `json:"path"`
	Added   *int   `json:"added,omitempty"`
	Removed *int   `json:"removed,omitempty"`
}

// sddPhaseReportCard is the concise gate surface (FR-007): grouped, scannable bullets.
type sddPhaseReportCard struct {
	Phase          string               `json:"phase"`
	Files          []sddFileChange      `json:"files"`
	TotalFiles     int                  `json:"totalFiles"`
	FilesTruncated bool                 `json:"filesTruncated"`
	Scope          string               `json:"scope"`
	Decisions      []string             `json:"decisions"`
	RunCount       int                  `json:"runCount"`
	Verification   *sddVerificationView `json:"verification,omitempty"`
}

// sddVerificationView is the gate verdict surfaced on the report card (specs/012 US2/US3/US4):
// the decision plus, on a block, the human-readable reason. Additive and omitempty, so older
// clients simply ignore it while the dashboard can show why a phase passed or is blocked.
type sddVerificationView struct {
	Decision     string `json:"decision"`               // pass | block | exempt
	BlockReason  string `json:"blockReason,omitempty"`  // why a behaviour change was blocked (TDD/UX unmet).
	ExemptReason string `json:"exemptReason,omitempty"` // why a docs/refactor phase needed no test.
	Bypassed     bool   `json:"bypassed,omitempty"`     // true when an audited override was used.
}

// captureWorkTree snapshots the full working tree (tracked + untracked, minus
// gitignored) as a git tree-object SHA, WITHOUT touching the developer's index. It
// stages into a private temp index via GIT_INDEX_FILE. Returns "" if git is
// unavailable or the directory is not a repo — the card then degrades (FR-013).
func captureWorkTree(repoRoot string) string {
	if repoRoot == "" {
		return ""
	}
	tmpIndex, err := os.CreateTemp("", "forge-sdd-index-*")
	if err != nil {
		return ""
	}
	tmpPath := tmpIndex.Name()
	_ = tmpIndex.Close()
	// git treats an existing 0-byte index as corrupt; GIT_INDEX_FILE must point at a
	// path it can create fresh, so remove the empty placeholder first.
	_ = os.Remove(tmpPath)
	defer os.Remove(tmpPath)

	indexEnv := append(os.Environ(), "GIT_INDEX_FILE="+tmpPath)

	// Stage the whole working tree into the empty temp index, then write it as a tree.
	addCmd := exec.Command("git", "add", "-A")
	addCmd.Dir = repoRoot
	addCmd.Env = indexEnv
	if runErr := addCmd.Run(); runErr != nil {
		return ""
	}
	writeCmd := exec.Command("git", "write-tree")
	writeCmd.Dir = repoRoot
	writeCmd.Env = indexEnv
	out, writeErr := writeCmd.Output()
	if writeErr != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// diffWorkTrees returns the per-file changes between two tree SHAs (the phase window).
// Returns nil when either snapshot is missing or git fails.
func diffWorkTrees(repoRoot, startTree, endTree string) []sddFileChange {
	if repoRoot == "" || startTree == "" || endTree == "" || startTree == endTree {
		return nil
	}
	cmd := exec.Command("git", "diff", "--numstat", startTree, endTree)
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		return nil
	}
	return parseNumstat(string(out))
}

// parseNumstat turns `git diff --numstat` output into file changes. A "-" magnitude
// (binary files) is left nil so the file is still listed with magnitude unavailable.
func parseNumstat(numstat string) []sddFileChange {
	var changes []sddFileChange
	for _, line := range strings.Split(strings.TrimSpace(numstat), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.SplitN(line, "\t", 3)
		if len(fields) != 3 {
			continue
		}
		change := sddFileChange{Path: fields[2]}
		if added, convErr := strconv.Atoi(fields[0]); convErr == nil {
			change.Added = &added
		}
		if removed, convErr := strconv.Atoi(fields[1]); convErr == nil {
			change.Removed = &removed
		}
		changes = append(changes, change)
	}
	return changes
}

// buildPhaseReportCard assembles the card from the phase's file changes, scope, and
// command-emitted decisions, truncating the file list to the top-N for scannability
// (FR-008). An empty file list yields a "No files changed" scope (US3 #4).
func buildPhaseReportCard(phase sdd.PhaseName, files []sddFileChange, scope string, decisions []string, runCount int) sddPhaseReportCard {
	// Normalize nil slices to empty slices so JSON serializes them as [] not null.
	// A JS destructuring default (files = []) only handles undefined, not null, so
	// a Go nil slice reaching the frontend would crash ReportCard with ".length on null".
	if files == nil {
		files = []sddFileChange{}
	}
	if decisions == nil {
		decisions = []string{}
	}
	card := sddPhaseReportCard{
		Phase:      string(phase),
		TotalFiles: len(files),
		Scope:      scope,
		Decisions:  decisions,
		RunCount:   runCount,
	}
	if card.Scope == "" {
		card.Scope = deriveScope(files)
	}
	if len(files) > sddReportCardMaxFiles {
		card.Files = append([]sddFileChange(nil), files[:sddReportCardMaxFiles]...)
		card.FilesTruncated = true
	} else {
		card.Files = files
	}
	return card
}

// deriveScope produces the one-line scope summary from the file changes.
func deriveScope(files []sddFileChange) string {
	if len(files) == 0 {
		return "No files changed"
	}
	totalAdded, totalRemoved := 0, 0
	for _, file := range files {
		if file.Added != nil {
			totalAdded += *file.Added
		}
		if file.Removed != nil {
			totalRemoved += *file.Removed
		}
	}
	return fmt.Sprintf("%d file(s) changed (+%d/-%d)", len(files), totalAdded, totalRemoved)
}

// buildSddPhaseReportCardForPipeline snapshots the working tree now, diffs it against the
// baseline captured at phase start, and assembles the card with the pipeline's stashed
// decisions and run count. Used by the gate broadcaster when a phase completes.
//
// All git snapshots are scoped to pipeline.repoRoot, which for a concurrent pipeline is its
// isolated worktree path (specs/011). This is what guarantees each pipeline's report lists
// ONLY its own files (FR-006) — do not substitute a main-checkout path here.
func buildSddPhaseReportCardForPipeline(pipeline *sddPipeline, phase sdd.PhaseName) sddPhaseReportCard {
	baseline := pipeline.baselineFor(phase)
	endTree := captureWorkTree(pipeline.repoRoot)
	files := diffWorkTrees(pipeline.repoRoot, baseline, endTree)
	card := buildPhaseReportCard(phase, files, "", pipeline.decisionsFor(phase), pipeline.orchestrator.PhaseRunCount(phase))
	if verification, ok := pipeline.verificationFor(phase); ok {
		card.Verification = newVerificationView(verification)
	}
	return card
}

// newVerificationView projects a stored verdict into the additive report-card view (specs/012).
func newVerificationView(verification sddPhaseVerification) *sddVerificationView {
	return &sddVerificationView{
		Decision:     string(verification.decision),
		BlockReason:  verification.record.BlockReason,
		ExemptReason: verification.record.Classification.ExemptReason,
		Bypassed:     verification.record.Bypassed,
	}
}
