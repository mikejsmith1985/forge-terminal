// handlers_sdd_test.go — verifies POST /api/sdd/decision routes to the right session's pipeline
// and, critically, is LENIENT so the card never traps the user (a stale cardId is acted on, not
// rejected). The orchestrator is real; its ports are mocked via the exported func adapters.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

// bindTestPipeline registers a pipeline for sessionID with a pending card for the given phase,
// and cleans it out of the global registry afterward.
func bindTestPipeline(t *testing.T, sessionID string, phase sdd.PhaseName) *sdd.Orchestrator {
	t.Helper()
	orchestrator := sdd.NewOrchestrator(sdd.Options{
		SessionID:      sessionID,
		HistoryBaseDir: t.TempDir(),
		Injector:       sdd.InjectorFunc(func(string, string) error { return nil }),
		Broadcaster:    sdd.BroadcasterFunc(func(sdd.DecisionCard) error { return nil }),
		Summarize:      func(sdd.PhaseName) sdd.PhaseSummary { return sdd.PhaseSummary{Headline: "H"} },
		NewCardID:      func(name sdd.PhaseName) string { return "card-" + string(name) },
	})
	orchestrator.HandlePhaseComplete(phase, string(phase)+".md")
	sddPipelines.Store(sessionID, &sddPipeline{orchestrator: orchestrator, repoRoot: "C:/repo/" + sessionID})
	t.Cleanup(func() { sddPipelines.Delete(sessionID) })
	return orchestrator
}

func postDecision(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/sdd/decision", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handleSddDecision(recorder, request)
	return recorder
}

func TestHandleSddDecision_ApproveReturns200(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "advancing") {
		t.Errorf("body = %s, want status advancing", recorder.Body.String())
	}
}

func TestHandleSddDecision_RejectReturns200(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"plan","action":"reject"}`)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "rejected") {
		t.Fatalf("status = %d body = %s, want 200 rejected", recorder.Code, recorder.Body.String())
	}
}

func TestHandleSddDecision_ClarifyReturns200(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"plan","action":"clarify","clarifyText":"narrow scope"}`)

	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "advancing") {
		t.Fatalf("status = %d body = %s, want 200 advancing", recorder.Code, recorder.Body.String())
	}
}

func TestHandleSddDecision_EmptyClarifyReturns400(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"plan","action":"clarify","clarifyText":"   "}`)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", recorder.Code, recorder.Body.String())
	}
}

// The failsafe: a stale cardId must NOT trap the user. The decision is applied to the pending
// card the user is looking at, returning success — not a 409.
func TestHandleSddDecision_StaleCardIdProceedsLeniently(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-STALE","phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("stale cardId must proceed leniently; status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
}

// Likewise a mismatched phase is ignored in favor of the pending card's phase.
func TestHandleSddDecision_StalePhaseUsesPendingCardPhase(t *testing.T) {
	bindTestPipeline(t, "sess-1", sdd.PhasePlan)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"specify","action":"approve"}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("phase mismatch must not trap; status = %d, body=%s", recorder.Code, recorder.Body.String())
	}
}

// Each session resolves its own card; a decision for one must not disturb another.
func TestHandleSddDecision_RoutesPerSession(t *testing.T) {
	orchestratorA := bindTestPipeline(t, "sess-A", sdd.PhasePlan)
	orchestratorB := bindTestPipeline(t, "sess-B", sdd.PhaseSpecify)

	recorder := postDecision(t, `{"sessionId":"sess-B","cardId":"card-specify","phase":"specify","action":"reject"}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if orchestratorB.State().PendingCard != nil {
		t.Errorf("sess-B card should be resolved after its decision")
	}
	if orchestratorA.State().PendingCard == nil {
		t.Errorf("sess-A card must be untouched by a sess-B decision")
	}
}

func TestHandleSddDecision_NoPipelineReturns409(t *testing.T) {
	recorder := postDecision(t, `{"sessionId":"ghost-session","phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 (no pipeline for session)", recorder.Code)
	}
}

// --- T017: handleSddStatus unit tests (Red: fails until T009 implements the handler) ---

func getStatus(t *testing.T, sessionID string) *httptest.ResponseRecorder {
	t.Helper()
	target := "/api/sdd/status"
	if sessionID != "" {
		target += "?sessionId=" + sessionID
	}
	recorder := httptest.NewRecorder()
	handleSddStatus(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	return recorder
}

func TestHandleSddStatus_NoPipelineBound_ReturnsEmptyPhases(t *testing.T) {
	recorder := getStatus(t, "ghost-session")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	var body map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["feature"] != "" {
		t.Errorf("feature = %q, want empty string for no pipeline", body["feature"])
	}
	phases, ok := body["phases"].([]any)
	if !ok || len(phases) != 0 {
		t.Errorf("phases should be empty array for no pipeline, got %v", body["phases"])
	}
}

func TestHandleSddStatus_ActivePipeline_ReturnsPhasesArray(t *testing.T) {
	sessionID := "status-active-sess"
	bindTestPipeline(t, sessionID, sdd.PhasePlan)

	recorder := getStatus(t, sessionID)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	var body map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	phases, ok := body["phases"].([]any)
	if !ok || len(phases) != 6 {
		t.Errorf("want 6 phases, got %v", body["phases"])
	}
}

func TestHandleSddStatus_MissingSessionId_Returns400(t *testing.T) {
	recorder := getStatus(t, "")

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for missing sessionId; body=%s", recorder.Code, recorder.Body.String())
	}
}

// --- end T017 ---
