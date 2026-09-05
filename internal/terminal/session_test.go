// session_test.go — unit tests for per-session environment construction.
// Verifies the authoritative per-tab identity (FORGE_SESSION_ID) is injected
// into the session environment so SDD phase signals can be scoped per tab
// (specs/010-sdd-authoritative-state, FR-003). Pure-function tests: no PTY is
// spawned, so they run in well under 10ms (constitution Article V).
package terminal

import (
	"fmt"
	"strings"
	"testing"
)

// containsEnv reports whether the environment slice holds an exact KEY=VALUE entry.
func containsEnv(env []string, want string) bool {
	for _, entry := range env {
		if entry == want {
			return true
		}
	}
	return false
}

// hasEnvKey reports whether any entry sets the given KEY (regardless of value).
func hasEnvKey(env []string, key string) bool {
	prefix := key + "="
	for _, entry := range env {
		if strings.HasPrefix(entry, prefix) {
			return true
		}
	}
	return false
}

// TestForgeSessionEnvInjectsSessionID asserts the session environment carries
// FORGE_SESSION_ID equal to the session id — the linchpin of per-tab SDD
// identity (FR-003). This is the failing test for the T002 red step.
func TestForgeSessionEnvInjectsSessionID(t *testing.T) {
	const sessionID = "tab-abc-123"

	env := forgeSessionEnv([]string{"PATH=/usr/bin"}, sessionID)

	want := fmt.Sprintf("FORGE_SESSION_ID=%s", sessionID)
	if !containsEnv(env, want) {
		t.Fatalf("session env missing %q; got %v", want, env)
	}
}

// TestForgeSessionEnvOmitsEmptySessionID ensures an empty session id does NOT
// inject an empty FORGE_SESSION_ID, which would be a bogus identity. A session
// without a real id is handled by the unbound path (FR-011a), not by a blank var.
func TestForgeSessionEnvOmitsEmptySessionID(t *testing.T) {
	env := forgeSessionEnv([]string{"PATH=/usr/bin"}, "")

	if hasEnvKey(env, "FORGE_SESSION_ID") {
		t.Fatalf("expected no FORGE_SESSION_ID for an empty session id; got %v", env)
	}
}

// TestForgeSessionEnvPreservesBaseEnv ensures the base environment is carried
// through unchanged (the injection is additive, never destructive).
func TestForgeSessionEnvPreservesBaseEnv(t *testing.T) {
	base := []string{"PATH=/usr/bin", "HOME=/home/dev"}

	env := forgeSessionEnv(base, "tab-xyz")

	for _, entry := range base {
		if !containsEnv(env, entry) {
			t.Fatalf("session env dropped base entry %q; got %v", entry, env)
		}
	}
}

// The pre-commit hook needs to find the Forge binary that is actually running,
// not whatever happens to be called "forge" on PATH (an unrelated npm package
// was). Forge knows its own path; exporting it into every tab removes the guess.
func TestForgeSessionEnvExportsTheRunningBinaryPath(t *testing.T) {
	env := forgeSessionEnv([]string{"PATH=/usr/bin"}, "tab-1")

	for _, entry := range env {
		if strings.HasPrefix(entry, "FORGE_BIN=") && len(entry) > len("FORGE_BIN=") {
			return
		}
	}
	t.Errorf("expected FORGE_BIN=<executable path> in the tab environment, got %v", env)
}
