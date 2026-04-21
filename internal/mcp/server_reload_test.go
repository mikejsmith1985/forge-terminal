// server_reload_test.go verifies the hot-reload behaviour of the MCP server's
// allowed_tools filter. Tests confirm that ReloadAllowedTools takes effect
// immediately for new calls and that the server remains race-free under load.
package mcp

import (
	"sync"
	"testing"
)

// ── Helpers ───────────────────────────────────────────────────────────────────

// buildReloadTestServer creates a server whose tool registry can be rebuilt
// without network or filesystem access. The injected mock runner satisfies
// the environment tools so all built-in tools are constructable in tests.
func buildReloadTestServer(allowedTools []string) *Server {
	deps := Dependencies{
		AllowedTools:             allowedTools,
		EnvironmentCommandRunner: &mockCommandRunner{},
	}
	return NewServer("test-token", deps)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// TestReloadAllowedTools_MakesNewToolAvailable verifies that a tool blocked by
// the initial filter becomes callable after ReloadAllowedTools adds it.
func TestReloadAllowedTools_MakesNewToolAvailable(t *testing.T) {
	// Start with only file_list allowed — terminal tools are blocked.
	srv := buildReloadTestServer([]string{"file_list"})

	_, initialErr := srv.ExecuteTool("terminal_sessions", nil)
	if initialErr == nil {
		t.Fatal("expected terminal_sessions to be blocked before reload, but it succeeded")
	}

	// Reload with terminal_sessions also allowed.
	srv.ReloadAllowedTools([]string{"file_list", "terminal_sessions"})

	_, reloadedErr := srv.ExecuteTool("terminal_sessions", nil)
	if reloadedErr != nil {
		t.Fatalf("expected terminal_sessions to be available after reload, got error: %v", reloadedErr)
	}
}

// TestReloadAllowedTools_RemovesDisabledTool verifies that a tool accessible
// before reload becomes blocked after it is removed from the allowed list.
func TestReloadAllowedTools_RemovesDisabledTool(t *testing.T) {
	// Start with all tools exposed (empty allowed list = no filter).
	srv := buildReloadTestServer(nil)

	_, initialErr := srv.ExecuteTool("terminal_sessions", nil)
	if initialErr != nil {
		t.Fatalf("expected terminal_sessions to be available at start, got error: %v", initialErr)
	}

	// Reload with a list that excludes terminal_sessions.
	srv.ReloadAllowedTools([]string{"file_list"})

	_, afterReloadErr := srv.ExecuteTool("terminal_sessions", nil)
	if afterReloadErr == nil {
		t.Fatal("expected terminal_sessions to be blocked after reload, but it succeeded")
	}
}

// TestReloadAllowedTools_EmptyListAllowsAllTools verifies that passing an empty
// slice to ReloadAllowedTools restores the "all tools exposed" default — the same
// semantics used at startup when allowed_tools is absent from forge.toml.
func TestReloadAllowedTools_EmptyListAllowsAllTools(t *testing.T) {
	// Start with a restricted list.
	srv := buildReloadTestServer([]string{"file_list"})

	_, restrictedErr := srv.ExecuteTool("terminal_sessions", nil)
	if restrictedErr == nil {
		t.Fatal("expected terminal_sessions to be blocked by initial filter")
	}

	// Reload with an empty list — should expose all built-in tools.
	srv.ReloadAllowedTools([]string{})

	_, openErr := srv.ExecuteTool("terminal_sessions", nil)
	if openErr != nil {
		t.Fatalf("expected terminal_sessions to be available after clearing the filter: %v", openErr)
	}
}

// TestReloadAllowedTools_ParseFailureKeepsLastGoodConfig demonstrates the intent
// of the fail-safe rule: the reload helper in handlers_mcp.go must not call
// ReloadAllowedTools when loadMCPConfigFromPath returns an error. This test
// verifies that a reload with a known-good list is stable and that a subsequent
// reload with the same list produces the same result (idempotent).
func TestReloadAllowedTools_IsIdempotent(t *testing.T) {
	srv := buildReloadTestServer([]string{"file_list"})

	// Apply the same reload twice — the second call must not change the tool set.
	srv.ReloadAllowedTools([]string{"file_list"})
	srv.ReloadAllowedTools([]string{"file_list"})

	_, err := srv.ExecuteTool("file_list", map[string]any{"path": "."})
	if err != nil {
		t.Fatalf("file_list should remain available after idempotent reload: %v", err)
	}

	_, blockedErr := srv.ExecuteTool("terminal_sessions", nil)
	if blockedErr == nil {
		t.Fatal("terminal_sessions should remain blocked after idempotent reload")
	}
}

// TestReloadAllowedTools_ConcurrentSafety exercises ReloadAllowedTools alongside
// concurrent ExecuteTool calls to confirm there are no data races.
// Run with: go test -race ./internal/mcp/
func TestReloadAllowedTools_ConcurrentSafety(t *testing.T) {
	srv := buildReloadTestServer(nil) // start with all tools allowed

	var waitGroup sync.WaitGroup

	// Spawn goroutines that concurrently reload and call tools.
	for goroutineIndex := 0; goroutineIndex < 20; goroutineIndex++ {
		waitGroup.Add(1)
		go func(index int) {
			defer waitGroup.Done()

			if index%2 == 0 {
				// Even goroutines reload between two lists.
				if index%4 == 0 {
					srv.ReloadAllowedTools([]string{"file_list"})
				} else {
					srv.ReloadAllowedTools(nil)
				}
			} else {
				// Odd goroutines execute a tool call — the result may be a
				// "not registered" error if a reload disabled it, which is fine.
				srv.ExecuteTool("terminal_sessions", nil) //nolint:errcheck
			}
		}(goroutineIndex)
	}

	waitGroup.Wait()
	// If the race detector found a problem it will have already panicked or
	// caused test failure. Reaching here means no data race was detected.
}

// TestReloadAllowedTools_BuildToolListConsistency verifies that buildToolList
// (used by tools/list RPC) reflects the state set by the most recent reload.
func TestReloadAllowedTools_BuildToolListConsistency(t *testing.T) {
	srv := buildReloadTestServer([]string{"file_list"})

	// Only file_list should be in the initial list.
	initialList := srv.buildToolList()
	if len(initialList.Tools) != 1 {
		t.Fatalf("expected 1 tool after filtered init, got %d", len(initialList.Tools))
	}
	if initialList.Tools[0].Name != "file_list" {
		t.Fatalf("expected file_list to be the sole tool, got %q", initialList.Tools[0].Name)
	}

	// After clearing the filter all built-in tools should appear.
	srv.ReloadAllowedTools(nil)
	fullList := srv.buildToolList()
	if len(fullList.Tools) < 2 {
		t.Fatalf("expected multiple tools after clearing filter, got %d", len(fullList.Tools))
	}
}
