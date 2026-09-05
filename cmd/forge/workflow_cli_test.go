// workflow_cli_test.go — exercises the `forge workflow` subcommand
// dispatcher.  We verify exit codes for the preflight path and for the
// record path so the pre-commit hook (which depends on exit code 2 for
// "blocked") stays honest.
package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// withTempCwd switches into a fresh temp directory so the subcommand
// reads/writes a clean .forge/workflow-ticket.json.  The original cwd
// is restored on test teardown.
func withTempCwd(t *testing.T) string {
	t.Helper()
	originalDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(originalDir) })
	return dir
}

func TestRunWorkflowCommand_PreflightBlocksWhenLedgerEmpty(t *testing.T) {
	withTempCwd(t)

	exitCode := runWorkflowCommand([]string{"preflight"})
	if exitCode != 2 {
		t.Fatalf("expected exit 2 (blocked), got %d", exitCode)
	}
}

func TestRunWorkflowCommand_PreflightPassesAfterAllGatesRecorded(t *testing.T) {
	dir := withTempCwd(t)

	// Record every required gate — preflight must then pass.
	for _, gate := range workflow.RequiredGates {
		if exit := runWorkflowCommand([]string{"record", gate, "evidence"}); exit != 0 {
			t.Fatalf("record %s expected 0, got %d", gate, exit)
		}
	}
	if exit := runWorkflowCommand([]string{"preflight"}); exit != 0 {
		t.Fatalf("preflight after all gates expected 0, got %d", exit)
	}

	// Sanity-check: the ticket file actually exists on disk.
	if _, err := os.Stat(filepath.Join(dir, ".forge", "workflow-ticket.json")); err != nil {
		t.Fatalf("expected ticket on disk: %v", err)
	}
}

func TestRunWorkflowCommand_UnknownSubcommandExitsNonZero(t *testing.T) {
	withTempCwd(t)

	if exit := runWorkflowCommand([]string{"nope"}); exit == 0 {
		t.Errorf("expected non-zero exit for unknown subcommand, got 0")
	}
}

// `forge workflow hooks` is what the installer scripts call, so it must put the
// gate where git looks rather than in .git/hooks unconditionally.
func TestRunWorkflowCommand_HooksInstallsWhereGitLooks(t *testing.T) {
	dir := withTempCwd(t)
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".git", "config"), []byte("[core]\n\thooksPath = .forge/hooks\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	if exit := runWorkflowCommand([]string{"hooks"}); exit != 0 {
		t.Fatalf("hooks expected exit 0, got %d", exit)
	}
	if _, err := os.Stat(filepath.Join(dir, ".forge", "hooks", "pre-commit")); err != nil {
		t.Fatalf("expected the hook under .forge/hooks: %v", err)
	}
}

func TestRunWorkflowCommand_HooksReportsAForeignHookWithExitTwo(t *testing.T) {
	dir := withTempCwd(t)
	if err := os.MkdirAll(filepath.Join(dir, ".git", "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".git", "hooks", "pre-commit"), []byte("#!/bin/sh\necho mine\n"), 0o755); err != nil {
		t.Fatal(err)
	}

	if exit := runWorkflowCommand([]string{"hooks"}); exit != 2 {
		t.Fatalf("a foreign hook should be reported with exit 2, got %d", exit)
	}
}
