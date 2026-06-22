// sdd_report_card_test.go — tests for the concise phase report card (specs/010, US3).
// The assembly/parse tests are pure (<10ms). The git-window test is an integration test
// against a real temp repository, proving "files touched" is scoped to the phase window
// and captures NEW (untracked) files, not just tracked edits (FR-014).
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

func intPtr(n int) *int { return &n }

func TestBuildPhaseReportCard_EmptyFilesSaysNoFilesChanged(t *testing.T) {
	card := buildPhaseReportCard(sdd.PhaseValidate, nil, "", nil, 1)

	if card.Scope != "No files changed" {
		t.Errorf("scope = %q, want 'No files changed' for a no-op phase", card.Scope)
	}
	if len(card.Files) != 0 || card.TotalFiles != 0 || card.FilesTruncated {
		t.Errorf("empty card has files: %+v", card)
	}
}

func TestBuildPhaseReportCard_DerivesScopeFromCounts(t *testing.T) {
	files := []sddFileChange{
		{Path: "spec.md", Added: intPtr(40), Removed: intPtr(2)},
		{Path: "plan.md", Added: intPtr(5), Removed: intPtr(0)},
	}
	card := buildPhaseReportCard(sdd.PhasePlan, files, "", []string{"chose retrofit"}, 1)

	if card.Scope != "2 file(s) changed (+45/-2)" {
		t.Errorf("scope = %q, want derived '+45/-2'", card.Scope)
	}
	if len(card.Decisions) != 1 || card.Decisions[0] != "chose retrofit" {
		t.Errorf("decisions = %v, want the command-emitted list", card.Decisions)
	}
}

func TestBuildPhaseReportCard_TruncatesLongFileList(t *testing.T) {
	var files []sddFileChange
	for i := 0; i < sddReportCardMaxFiles+5; i++ {
		files = append(files, sddFileChange{Path: "f", Added: intPtr(1), Removed: intPtr(0)})
	}
	card := buildPhaseReportCard(sdd.PhaseImplement, files, "", nil, 1)

	if len(card.Files) != sddReportCardMaxFiles {
		t.Errorf("shown files = %d, want capped at %d", len(card.Files), sddReportCardMaxFiles)
	}
	if !card.FilesTruncated {
		t.Error("FilesTruncated should be true when the list exceeds the cap")
	}
	if card.TotalFiles != sddReportCardMaxFiles+5 {
		t.Errorf("TotalFiles = %d, want the full count %d", card.TotalFiles, sddReportCardMaxFiles+5)
	}
}

func TestParseNumstat_BinaryFileHasUnavailableMagnitude(t *testing.T) {
	// git emits "-\t-\t<path>" for binary files; the file is still listed (FR-013).
	changes := parseNumstat("10\t2\tspec.md\n-\t-\timage.png\n")

	if len(changes) != 2 {
		t.Fatalf("parsed %d changes, want 2", len(changes))
	}
	if changes[0].Added == nil || *changes[0].Added != 10 || changes[0].Removed == nil || *changes[0].Removed != 2 {
		t.Errorf("text file change = %+v, want +10/-2", changes[0])
	}
	if changes[1].Path != "image.png" || changes[1].Added != nil || changes[1].Removed != nil {
		t.Errorf("binary file change = %+v, want listed with nil magnitude", changes[1])
	}
}

// --- integration: real git working-tree window (T024) ---

func git(t *testing.T, repo string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = repo
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=t", "GIT_AUTHOR_EMAIL=t@t",
		"GIT_COMMITTER_NAME=t", "GIT_COMMITTER_EMAIL=t@t")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func writeRepoFile(t *testing.T, repo, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(repo, name), []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
}

func TestReportCardGitWindow_CapturesNewAndModifiedFiles(t *testing.T) {
	repo := t.TempDir()
	git(t, repo, "init")
	writeRepoFile(t, repo, "existing.txt", "line1\nline2\n")
	git(t, repo, "add", "-A")
	git(t, repo, "commit", "-m", "initial")

	start := captureWorkTree(repo)
	if start == "" {
		t.Fatal("captureWorkTree(start) returned empty — git snapshot failed")
	}

	// During the phase: create a NEW (untracked) file and modify the existing one.
	writeRepoFile(t, repo, "new.md", "a\nb\nc\n")
	writeRepoFile(t, repo, "existing.txt", "line1\nline2\nline3\n")

	end := captureWorkTree(repo)
	if end == "" || end == start {
		t.Fatalf("captureWorkTree(end) = %q (start %q), want a distinct non-empty tree", end, start)
	}

	changes := diffWorkTrees(repo, start, end)
	byPath := map[string]sddFileChange{}
	for _, change := range changes {
		byPath[filepath.ToSlash(change.Path)] = change
	}

	if change, ok := byPath["new.md"]; !ok || change.Added == nil || *change.Added != 3 {
		t.Errorf("new.md = %+v, want added=3 (NEW untracked file must be captured)", byPath["new.md"])
	}
	if change, ok := byPath["existing.txt"]; !ok || change.Added == nil || *change.Added != 1 {
		t.Errorf("existing.txt = %+v, want added=1 (modified tracked file)", byPath["existing.txt"])
	}
}

func TestReportCardGitWindow_NoChangesYieldsEmptyList(t *testing.T) {
	repo := t.TempDir()
	git(t, repo, "init")
	writeRepoFile(t, repo, "a.txt", "x\n")
	git(t, repo, "add", "-A")
	git(t, repo, "commit", "-m", "initial")

	snapshot := captureWorkTree(repo)
	// No changes between identical snapshots → no files.
	if changes := diffWorkTrees(repo, snapshot, snapshot); changes != nil {
		t.Errorf("diff of identical snapshots = %v, want nil", changes)
	}
}
