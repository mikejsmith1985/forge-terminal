// handlers_sdd_phaseevent_test.go — integration tests for the authoritative
// phase-event endpoint (specs/010-sdd-authoritative-state, FR-001/FR-004/FR-011).
// These exercise POST /api/sdd/phase-event end-to-end through a real orchestrator
// (termHandler is nil, so broadcasts are skipped but state transitions are real).
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// newPhaseEventTestPipeline builds a bound pipeline backed by a real orchestrator and a temp
// repo whose .specify/feature.json points at a feature dir. Returns the session id and pipeline.
func newPhaseEventTestPipeline(t *testing.T, sessionID string) *sddPipeline {
	t.Helper()
	repoRoot := t.TempDir()
	featureRel := "specs/010-test"
	featureDir := filepath.Join(repoRoot, filepath.FromSlash(featureRel))
	if err := os.MkdirAll(featureDir, 0o755); err != nil {
		t.Fatalf("mkdir feature: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(repoRoot, ".specify"), 0o755); err != nil {
		t.Fatalf("mkdir .specify: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repoRoot, ".specify", "feature.json"),
		[]byte(`{"feature_directory":"`+featureRel+`"}`), 0o644); err != nil {
		t.Fatalf("write feature.json: %v", err)
	}
	// Seed the phase artifacts so the deterministic summary builder has files to read.
	for _, name := range []string{"spec.md", "plan.md"} {
		if err := os.WriteFile(filepath.Join(featureDir, name), []byte("# "+name), 0o644); err != nil {
			t.Fatalf("seed %s: %v", name, err)
		}
	}

	orchestrator := sdd.NewOrchestrator(sdd.Options{SessionID: sessionID})
	pipeline := &sddPipeline{orchestrator: orchestrator, repoRoot: repoRoot}
	sddPipelines.Store(sessionID, pipeline)
	t.Cleanup(func() { sddPipelines.Delete(sessionID) })
	return pipeline
}

// postPhaseEvent invokes the handler directly and returns the response recorder.
func postPhaseEvent(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/sdd/phase-event", strings.NewReader(body))
	rec := httptest.NewRecorder()
	handleSddPhaseEvent(rec, req)
	return rec
}

func TestPhaseEvent_StartedMarksPhaseRunning(t *testing.T) {
	pipeline := newPhaseEventTestPipeline(t, "pe-started")

	rec := postPhaseEvent(t, `{"sessionId":"pe-started","phase":"plan","event":"started"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	state := pipeline.orchestrator.State()
	if state.Status != sdd.StatusRunning {
		t.Errorf("status = %q, want running", state.Status)
	}
	if state.CurrentPhase != sdd.PhasePlan {
		t.Errorf("current phase = %q, want plan", state.CurrentPhase)
	}
}

func TestPhaseEvent_CompleteOpensGateWithDecisions(t *testing.T) {
	pipeline := newPhaseEventTestPipeline(t, "pe-complete")

	postPhaseEvent(t, `{"sessionId":"pe-complete","phase":"plan","event":"started"}`)
	rec := postPhaseEvent(t, `{"sessionId":"pe-complete","phase":"plan","event":"complete","decisions":["chose retrofit over rewrite"]}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	state := pipeline.orchestrator.State()
	if state.Status != sdd.StatusAwaitingDecision {
		t.Fatalf("status = %q, want awaiting-decision", state.Status)
	}
	if state.PendingCard == nil || state.PendingCard.Phase != sdd.PhasePlan {
		t.Fatalf("pending card = %v, want an open gate for plan", state.PendingCard)
	}
	decisions := pipeline.decisionsFor(sdd.PhasePlan)
	if len(decisions) != 1 || decisions[0] != "chose retrofit over rewrite" {
		t.Errorf("stored decisions = %v, want the command-emitted list", decisions)
	}
}

func TestPhaseEvent_DuplicateCompleteIsNoOp(t *testing.T) {
	pipeline := newPhaseEventTestPipeline(t, "pe-dup")

	postPhaseEvent(t, `{"sessionId":"pe-dup","phase":"plan","event":"started"}`)
	postPhaseEvent(t, `{"sessionId":"pe-dup","phase":"plan","event":"complete"}`)
	// Second complete for the same open gate (e.g. the watcher fallback) must not double-count.
	postPhaseEvent(t, `{"sessionId":"pe-dup","phase":"plan","event":"complete"}`)

	if got := pipeline.orchestrator.PhaseRunCount(sdd.PhasePlan); got != 1 {
		t.Errorf("run count = %d, want 1 (duplicate complete must be a no-op)", got)
	}
}

func TestPhaseEvent_UnknownSessionIsIgnored(t *testing.T) {
	rec := postPhaseEvent(t, `{"sessionId":"pe-nobody","phase":"plan","event":"started"}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["status"] != "ignored" {
		t.Errorf("status = %q, want ignored (unbound session is a no-op, FR-011)", resp["status"])
	}
	if _, exists := sddPipelineFor("pe-nobody"); exists {
		t.Error("an unknown session must not create a pipeline")
	}
}

func TestPhaseEvent_RejectsUnknownPhaseAndEvent(t *testing.T) {
	newPhaseEventTestPipeline(t, "pe-bad")

	if rec := postPhaseEvent(t, `{"sessionId":"pe-bad","phase":"bogus","event":"started"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown phase: status = %d, want 400", rec.Code)
	}
	if rec := postPhaseEvent(t, `{"sessionId":"pe-bad","phase":"plan","event":"bogus"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown event: status = %d, want 400", rec.Code)
	}
}
