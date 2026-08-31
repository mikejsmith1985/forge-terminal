// integration_test.go — the integration layer (Article V): exercises real infrastructure
// rather than mocks. The summarizer reads real files from disk, and the notifier performs a
// real HTTP POST to a live local server. This closes the gap left by the 100%-mocked unit
// tests (analyze finding C1). These are hermetic (temp dir + httptest) so they stay fast.
package sdd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// writeArtifact writes a real file (creating parent dirs) under the feature directory.
func writeArtifact(t *testing.T, baseDir, relPath, content string) {
	t.Helper()
	full := filepath.Join(baseDir, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestIntegration_SummarizeReadsRealArtifacts runs the summarizer against real files on disk
// (no mock fileSource), proving the production osFileSource path produces the right flags.
func TestIntegration_SummarizeReadsRealArtifacts(t *testing.T) {
	dir := t.TempDir()
	writeArtifact(t, dir, "plan.md", "# Plan\nready")
	writeArtifact(t, dir, "research.md", "# Research")
	writeArtifact(t, dir, "spec.md", "# Spec\nno markers here")
	writeArtifact(t, dir, "checklists/requirements.md", "- [x] done\n- [ ] open one\n- [ ] open two")

	summary := summarize(PhasePlan, osFileSource(dir))

	if !strings.HasPrefix(summary.Headline, "Plan ready") {
		t.Errorf("headline = %q, want it to start with 'Plan ready'", summary.Headline)
	}
	if got := flagLabel(summary, FlagUncheckedChecklist); got != "2 checklist items unchecked" {
		t.Errorf("unchecked flag = %q, want '2 checklist items unchecked'", got)
	}
	if !containsItem(summary.ProducedItems, "plan.md") || !containsItem(summary.ProducedItems, "research.md") {
		t.Errorf("produced items %v should include real plan.md + research.md", summary.ProducedItems)
	}
}

// TestIntegration_NotifierPostsToRealServer starts a real HTTP server and verifies the notifier
// delivers a correctly-shaped POST to it (a real network round-trip, not a mocked transport).
func TestIntegration_NotifierPostsToRealServer(t *testing.T) {
	received := make(chan NotificationEvent, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event NotificationEvent
		_ = json.NewDecoder(r.Body).Decode(&event)
		received <- event
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	t.Setenv(notifyURLEnvVar, server.URL) // NewNotifier reads the endpoint from the env

	NewNotifier().Notify("003-sdd-phase-orchestrator", PhasePlan, "plan.md")

	select {
	case event := <-received:
		if event.Feature != "003-sdd-phase-orchestrator" || event.Phase != "plan" || event.ArtifactPath != "plan.md" {
			t.Errorf("server received %+v, want feature/plan/plan.md", event)
		}
		if event.Timestamp == "" {
			t.Errorf("server received empty timestamp")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("notifier did not POST to the real server within 2s")
	}
}
