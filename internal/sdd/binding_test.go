// binding_test.go — verifies pipeline-to-session resolution, including subdirectory and
// cross-platform path matching (research R9).
package sdd

import "testing"

func TestResolveSession(t *testing.T) {
	sessions := []SessionInfo{
		{ID: "a", CurrentDir: "C:/Other/project"},
		{ID: "b", CurrentDir: "C:/ProjectsWin/forge-terminal"},
	}

	if id, ok := resolveSession(sessions, "C:/ProjectsWin/forge-terminal"); !ok || id != "b" {
		t.Errorf("exact match = (%q, %v), want (b, true)", id, ok)
	}

	// A session sitting in a subdirectory of the repo still binds to the pipeline.
	sub := []SessionInfo{{ID: "c", CurrentDir: "C:\\ProjectsWin\\forge-terminal\\internal\\sdd"}}
	if id, ok := resolveSession(sub, "C:/ProjectsWin/forge-terminal"); !ok || id != "c" {
		t.Errorf("subdir match = (%q, %v), want (c, true)", id, ok)
	}

	if _, ok := resolveSession(sessions, "C:/Nowhere"); ok {
		t.Errorf("no session matches C:/Nowhere; want false")
	}
}
