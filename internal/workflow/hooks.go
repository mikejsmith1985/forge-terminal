// hooks.go — putting the workflow gate into the pre-commit hook git actually runs.
//
// EnsureHookInstalled is called whenever a gate is recorded, so developers (and
// agents) never need to remember a manual install step. It is idempotent: a
// second call is always a safe no-op.
//
// WHY THIS LOOKS WHERE IT LOOKS. Forge's own scaffold sets core.hooksPath to
// .forge/hooks and writes its "Enhanced" hook there. The first version of this
// file wrote the ledger hook into .git/hooks — a directory git had been told to
// ignore — so in every scaffolded repository the ledger gate never executed at
// all. "Pre-commit checks passed" was the scaffold hook talking. The rule now is
// simple: ask git where it looks, and if a hook of ours is already there, put
// the gate inside it rather than beside it.
package workflow

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// hookMarker is the magic string embedded in every hook carrying the ledger
// gate. Its presence means the gate is installed and the file must not be
// touched again.
const hookMarker = "# forge-hook-v1"

// scaffoldHookSignature identifies a pre-commit hook written by Forge's own
// Workflow Architect scaffold. That hook is ours to extend; anything else is
// somebody's custom logic and is left alone.
const scaffoldHookSignature = "Pre-Commit Hook (Enhanced)"

// preCommitHookName is the file git runs before every commit.
const preCommitHookName = "pre-commit"

// gitConfigFileName holds the repository's settings, including core.hooksPath.
const gitConfigFileName = "config"

// commonDirFileName is written into a linked worktree's git directory to point
// at the shared repository state.
const commonDirFileName = "commondir"

// ErrForeignPreCommitHook is returned when a pre-commit hook written by another
// tool already occupies the slot. The gate is not installed, and the caller
// should say so: a silent skip here is how the gate went missing for months.
var ErrForeignPreCommitHook = errors.New("a pre-commit hook written by another tool is already installed; " +
	"the Forge workflow gate was not added to it — run scripts/install-workflow-hooks to merge by hand")

// EffectiveHooksDir reports the directory git will read hooks from for a project.
//
// core.hooksPath wins when set; a relative value is resolved against the
// working tree, as git does. Otherwise it is the hooks directory of the shared
// repository — the common directory for a linked worktree, .git for an
// ordinary checkout. Returns os.ErrNotExist when the path is not a git tree.
//
// @param projectRoot The project directory, which may be a linked worktree.
func EffectiveHooksDir(projectRoot string) (string, error) {
	gitDirectory := resolveGitDirectory(projectRoot)
	if gitDirectory == "" {
		return "", os.ErrNotExist
	}
	commonDirectory := gitCommonDirectory(gitDirectory)

	configuredPath := readCoreHooksPath(filepath.Join(commonDirectory, gitConfigFileName))
	if configuredPath == "" {
		return filepath.Join(commonDirectory, "hooks"), nil
	}
	if filepath.IsAbs(configuredPath) {
		return filepath.Clean(configuredPath), nil
	}
	return filepath.Join(projectRoot, filepath.FromSlash(configuredPath)), nil
}

// gitCommonDirectory follows a worktree's commondir pointer to the shared
// repository, or returns the directory itself for an ordinary checkout.
func gitCommonDirectory(gitDirectory string) string {
	pointer, err := os.ReadFile(filepath.Join(gitDirectory, commonDirFileName))
	if err != nil {
		return gitDirectory
	}
	target := strings.TrimSpace(string(pointer))
	if target == "" {
		return gitDirectory
	}
	if !filepath.IsAbs(target) {
		target = filepath.Join(gitDirectory, target)
	}
	return filepath.Clean(target)
}

// readCoreHooksPath pulls core.hooksPath out of a git config file.
//
// A deliberately small INI reader: sections in brackets, key = value lines,
// keys case-insensitive, optional double quotes. Reading the file directly
// keeps this usable from a unit test and from a hook shell without git on
// PATH, and spawns no console window on Windows.
func readCoreHooksPath(configPath string) string {
	content, err := os.ReadFile(configPath)
	if err != nil {
		return ""
	}

	isInCoreSection := false
	for _, rawLine := range strings.Split(string(content), "\n") {
		line := strings.TrimSpace(rawLine)
		if strings.HasPrefix(line, "[") {
			isInCoreSection = strings.EqualFold(line, "[core]")
			continue
		}
		if !isInCoreSection {
			continue
		}
		key, value, hasValue := strings.Cut(line, "=")
		if !hasValue || !strings.EqualFold(strings.TrimSpace(key), "hooksPath") {
			continue
		}
		return strings.Trim(strings.TrimSpace(value), `"`)
	}
	return ""
}

// EnsureHookInstalled makes sure the pre-commit hook git runs carries the
// workflow gate.
//
// Behaviour matrix:
//   - Not a git tree                    → silent no-op
//   - No hook in the effective dir      → write the standalone gate hook
//   - Hook present with marker          → skip (already installed)
//   - Hook is Forge's own scaffold hook → insert the gate ahead of its checks
//   - Hook written by another tool      → leave it, return ErrForeignPreCommitHook
//
// RecordGate treats the error as best-effort so recording never blocks on it,
// but the MCP tool surfaces it, because a gate that quietly failed to install
// is indistinguishable from one that passed.
func EnsureHookInstalled(projectRoot string) error {
	hooksDirectory, err := EffectiveHooksDir(projectRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if mkErr := os.MkdirAll(hooksDirectory, 0o755); mkErr != nil {
		return mkErr
	}

	hookPath := filepath.Join(hooksDirectory, preCommitHookName)
	existing, readErr := os.ReadFile(hookPath)
	if readErr == nil {
		return extendExistingHook(hookPath, string(existing))
	}
	if !os.IsNotExist(readErr) {
		return readErr
	}
	return os.WriteFile(hookPath, []byte(preCommitHookScript()), 0o755)
}

// extendExistingHook decides what to do with a hook that is already there.
func extendExistingHook(hookPath, content string) error {
	if strings.Contains(content, hookMarker) {
		return nil
	}
	if strings.Contains(content, scaffoldHookSignature) {
		return os.WriteFile(hookPath, []byte(mergeLedgerGate(content)), 0o755)
	}
	return ErrForeignPreCommitHook
}

// mergeLedgerGate inserts the gate ahead of a script's first statement.
//
// Ahead, not after: the scaffold hook ends in its own exit 0, so anything
// appended to it would never run. The shebang and any leading comment header
// stay where they are.
func mergeLedgerGate(script string) string {
	if strings.Contains(script, hookMarker) {
		return script
	}
	lines := strings.Split(script, "\n")
	insertAt := firstStatementIndex(lines)

	merged := make([]string, 0, len(lines)+len(ledgerGateBlock())+2)
	merged = append(merged, lines[:insertAt]...)
	merged = append(merged, ledgerGateBlock()...)
	merged = append(merged, "")
	merged = append(merged, lines[insertAt:]...)
	return strings.Join(merged, "\n")
}

// firstStatementIndex finds the first line that is neither blank nor a comment.
func firstStatementIndex(lines []string) int {
	for index, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		return index
	}
	return len(lines)
}

// preCommitHookScript returns the standalone POSIX hook written when no hook
// exists yet: the gate block, then exit 0.
//
// scripts/install-workflow-hooks.{ps1,sh} produce the same result by hand;
// any change to the block should be mirrored there.
func preCommitHookScript() string {
	lines := []string{
		"#!/usr/bin/env sh",
		"# Forge Terminal — runtime workflow pre-commit gate.",
		"# Auto-installed by 'forge workflow record'; safe to regenerate via",
		"# scripts/install-workflow-hooks.{ps1,sh}.",
		"",
	}
	lines = append(lines, ledgerGateBlock()...)
	lines = append(lines, "", "exit 0", "")
	return strings.Join(lines, "\n")
}

// ledgerGateBlock is the gate itself, written so it can sit at the top of
// another script: it exits only to refuse, and falls through on success so
// whatever follows still runs. No set -e, because the host script may not
// want it; every status is checked explicitly.
func ledgerGateBlock() []string {
	return []string{
		hookMarker + " — Forge Terminal runtime workflow gate (ledger + naming).",
		"# Refuses a commit whose gates were never recorded. Falls through on success.",
		`if [ "${FORGE_BYPASS:-0}" = "1" ]; then`,
		`  forge_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")`,
		`  forge_reason="${FORGE_BYPASS_REASON:-no reason provided}"`,
		`  mkdir -p .forge`,
		`  printf "%s bypass: %s\n" "$forge_ts" "$forge_reason" >> .forge/bypasses.log`,
		`  echo "[forge] FORGE_BYPASS=1 — workflow gate skipped, logged to .forge/bypasses.log"`,
		`else`,
		`  forge_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")`,
		`  case "$forge_branch" in`,
		`    main|master)`,
		`      echo "[forge] BLOCKED: refusing to commit directly to '$forge_branch'." >&2`,
		`      echo "[forge] Create a feature branch first (e.g. 'git checkout -b feature/foo')." >&2`,
		`      echo "[forge] Set FORGE_BYPASS=1 with FORGE_BYPASS_REASON=... to override." >&2`,
		`      exit 1`,
		`      ;;`,
		`  esac`,
		``,
		`  # The running Forge exports its own path as FORGE_BIN. A bare "forge" on`,
		`  # PATH is deliberately NOT tried: an unrelated npm package answers to that`,
		`  # name, and the gate then blocked every commit with a message about nothing.`,
		`  forge_bin=""`,
		`  if [ -n "${FORGE_BIN:-}" ] && [ -x "$FORGE_BIN" ]; then forge_bin="$FORGE_BIN"`,
		`  elif [ -x "./forge" ]; then forge_bin="./forge"`,
		`  elif [ -x "./fterm.exe" ]; then forge_bin="./fterm.exe"`,
		`  elif [ -x "./forge.exe" ]; then forge_bin="./forge.exe"`,
		`  elif command -v fterm >/dev/null 2>&1; then forge_bin="fterm"`,
		`  fi`,
		``,
		`  if [ -z "$forge_bin" ]; then`,
		`    echo "[forge] WARNING: Forge Terminal not found — the workflow gate did NOT run." >&2`,
		`    echo "[forge] Commit from a Forge Terminal tab (FORGE_BIN is set there), or put fterm on PATH." >&2`,
		`  else`,
		`    # Names first: a name that reads badly is cheaper to fix before the`,
		`    # gates are argued about than after.`,
		`    "$forge_bin" workflow naming`,
		`    forge_naming_status=$?`,
		`    if [ "$forge_naming_status" -eq 2 ]; then`,
		`      echo "" >&2`,
		`      echo "[forge] BLOCKED: a name above tells the reader nothing." >&2`,
		`      echo "[forge] Rename it after what a person would see on screen, then retry." >&2`,
		`      echo "[forge] Override with FORGE_BYPASS=1 FORGE_BYPASS_REASON=... git commit ..." >&2`,
		`      exit 1`,
		`    fi`,
		``,
		`    "$forge_bin" workflow preflight`,
		`    forge_status=$?`,
		`    if [ "$forge_status" -eq 0 ]; then`,
		`      echo "[forge] workflow gate: PASS"`,
		`    elif [ "$forge_status" -eq 2 ]; then`,
		`      echo "" >&2`,
		`      echo "[forge] BLOCKED: workflow ticket is missing required gates, or belongs to another branch (see reason above)." >&2`,
		`      echo "[forge] Record this branch's gates via the workflow_gate_record MCP tool under a new taskId, then retry." >&2`,
		`      echo "[forge] Required gates: branch-created, tests-written, tests-passed, brief-published." >&2`,
		`      echo "[forge] Publish a brief with the change_brief_publish tool; record the rest with workflow_gate_record." >&2`,
		`      echo "[forge] Override with FORGE_BYPASS=1 FORGE_BYPASS_REASON=... git commit ..." >&2`,
		`      exit 1`,
		`    else`,
		`      echo "[forge] preflight returned unexpected status $forge_status — blocking commit." >&2`,
		`      echo "[forge] '$forge_bin' did not answer like Forge Terminal; commit from a Forge tab so FORGE_BIN is set." >&2`,
		`      exit 1`,
		`    fi`,
		`  fi`,
		`fi`,
	}
}
