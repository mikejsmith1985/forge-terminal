// hooks.go — automatic pre-commit hook installation for the workflow gate system.
//
// EnsureHookInstalled is called the first time RecordGate creates a new ticket
// for a project, so developers (and agents) never need to remember a manual
// install step.  The function is idempotent: calling it a second time is always
// a safe no-op.
package workflow

import (
	"os"
	"path/filepath"
	"strings"
)

// hookMarker is the magic string embedded in every Forge-managed hook script.
// Its presence means the hook was installed by Forge and is safe to skip on
// subsequent calls.
const hookMarker = "# forge-hook-v1"

// EnsureHookInstalled idempotently writes the Forge pre-commit hook to
// <projectRoot>/.git/hooks/pre-commit.
//
// Behaviour matrix:
//   - No .git directory          → silent no-op (bare repo, git worktree file, etc.)
//   - Hook absent                → write our hook and make it executable
//   - Hook present with marker   → skip (already installed)
//   - Hook present without marker → skip (preserve user's existing hook)
//
// Errors are returned to the caller, but RecordGate treats them as
// best-effort and never blocks gate recording because of a hook-install failure.
func EnsureHookInstalled(projectRoot string) error {
	gitPath := filepath.Join(projectRoot, ".git")

	// If .git doesn't exist this is not a standard git working tree — skip.
	if _, statErr := os.Stat(gitPath); os.IsNotExist(statErr) {
		return nil
	}

	hooksDir := filepath.Join(gitPath, "hooks")
	if mkErr := os.MkdirAll(hooksDir, 0o755); mkErr != nil {
		return mkErr
	}

	hookPath := filepath.Join(hooksDir, "pre-commit")

	// Read any existing hook to decide whether we should write.
	existing, readErr := os.ReadFile(hookPath)
	if readErr == nil {
		if strings.Contains(string(existing), hookMarker) {
			return nil // Already installed — nothing to do.
		}
		// A hook exists but was written by a different tool.  Leave it alone so
		// we don't silently discard a user's custom pre-commit logic.
		return nil
	}
	if !os.IsNotExist(readErr) {
		return readErr // Unexpected I/O error.
	}

	// No hook exists yet — write ours.
	return os.WriteFile(hookPath, []byte(preCommitHookScript()), 0o755)
}

// preCommitHookScript returns the POSIX shell script written to pre-commit.
//
// The script is intentionally identical in behaviour to the one produced by
// scripts/install-workflow-hooks.{ps1,sh} so that manually re-running the
// installer produces the same result.  Any changes here should be mirrored
// in those scripts (and vice-versa).
func preCommitHookScript() string {
	lines := []string{
		"#!/usr/bin/env sh",
		hookMarker,
		"# Forge Terminal — runtime workflow pre-commit gate.",
		"# Auto-installed by 'forge workflow record'; safe to regenerate via",
		"# scripts/install-workflow-hooks.{ps1,sh}.",
		"",
		"set -e",
		"",
		`if [ "${FORGE_BYPASS:-0}" = "1" ]; then`,
		`  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")`,
		`  reason="${FORGE_BYPASS_REASON:-no reason provided}"`,
		`  mkdir -p .forge`,
		`  printf "%s bypass: %s\n" "$ts" "$reason" >> .forge/bypasses.log`,
		`  echo "[forge] FORGE_BYPASS=1 — workflow gate skipped, logged to .forge/bypasses.log"`,
		`  exit 0`,
		`fi`,
		"",
		"# Refuse commits straight to main / master.",
		`branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")`,
		`case "$branch" in`,
		"  main|master)",
		`    echo "[forge] BLOCKED: refusing to commit directly to '$branch'." >&2`,
		`    echo "[forge] Create a feature branch first (e.g. 'git checkout -b feature/foo')." >&2`,
		`    echo "[forge] Set FORGE_BYPASS=1 with FORGE_BYPASS_REASON=... to override." >&2`,
		`    exit 1`,
		`    ;;`,
		"esac",
		"",
		"# Locate a forge binary.  Prefer the project-local build, then PATH.",
		`forge_bin=""`,
		`if [ -x "./forge" ]; then forge_bin="./forge"`,
		`elif [ -x "./fterm.exe" ]; then forge_bin="./fterm.exe"`,
		`elif [ -x "./forge.exe" ]; then forge_bin="./forge.exe"`,
		`elif command -v forge >/dev/null 2>&1; then forge_bin="forge"`,
		`elif command -v fterm >/dev/null 2>&1; then forge_bin="fterm"`,
		`fi`,
		"",
		`if [ -z "$forge_bin" ]; then`,
		`  echo "[forge] WARNING: forge binary not found — skipping ticket preflight." >&2`,
		`  echo "[forge] Install Forge Terminal or run from a built source tree to enable enforcement." >&2`,
		`  exit 0`,
		`fi`,
		"",
		"# Run preflight.  Exit code 2 = required gates missing.",
		`"$forge_bin" workflow preflight`,
		`status=$?`,
		`if [ "$status" -eq 0 ]; then`,
		`  echo "[forge] workflow gate: PASS"`,
		`  exit 0`,
		`fi`,
		`if [ "$status" -eq 2 ]; then`,
		`  echo "" >&2`,
		`  echo "[forge] BLOCKED: workflow ticket is missing required gates." >&2`,
		`  echo "[forge] Record gates via the workflow_gate_record MCP tool, then retry." >&2`,
		`  echo "[forge] Required gates: branch-created, tests-written, tests-passed." >&2`,
		`  echo "[forge] Override with FORGE_BYPASS=1 FORGE_BYPASS_REASON=... git commit ..." >&2`,
		`  exit 1`,
		`fi`,
		`echo "[forge] preflight returned unexpected status $status — blocking commit." >&2`,
		`exit 1`,
		"",
	}
	return strings.Join(lines, "\n")
}
