// handlers_sdd_test.go — verifies POST /api/sdd/decision routes to the right session's pipeline
// and, critically, is LENIENT so the card never traps the user (a stale cardId is acted on, not
// rejected). The orchestrator is real; its ports are mocked via the exported func adapters.
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

// ── handleSddGateCheck tests (specs/008 US1 gate enforcement endpoint) ────────

func getGateCheck(t *testing.T, sessionID string) *httptest.ResponseRecorder {
	t.Helper()
	target := "/api/sdd/gate-check"
	if sessionID != "" {
		target += "?sessionId=" + sessionID
	}
	recorder := httptest.NewRecorder()
	handleSddGateCheck(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	return recorder
}

func TestHandleSddGateCheck_NoPipelinesRegistered_ReturnsGateNotOpen(t *testing.T) {
	recorder := getGateCheck(t, "no-such-session")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	var body map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["isGateOpen"] != false {
		t.Errorf("isGateOpen = %v, want false when no pipelines registered", body["isGateOpen"])
	}
}

func TestHandleSddGateCheck_OpenGateReturnsPhaseAndTrue(t *testing.T) {
	bindTestPipeline(t, "sess-gate-open", sdd.PhasePlan)

	recorder := getGateCheck(t, "sess-gate-open")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	var body map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["isGateOpen"] != true {
		t.Errorf("isGateOpen = %v, want true when a pipeline awaits a decision", body["isGateOpen"])
	}
	if body["phase"] != "plan" {
		t.Errorf("phase = %v, want plan", body["phase"])
	}
}

func TestHandleSddGateCheck_MethodNotAllowed(t *testing.T) {
	recorder := httptest.NewRecorder()
	handleSddGateCheck(recorder, httptest.NewRequest(http.MethodPost, "/api/sdd/gate-check", nil))

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405 for POST on gate-check", recorder.Code)
	}
}

func TestHandleSddGateCheck_GateClosedAfterApproveReturnsNotOpen(t *testing.T) {
	sessionID := "sess-gate-then-approve"
	orchestrator := bindTestPipeline(t, sessionID, sdd.PhasePlan)

	// Verify gate is open before the decision.
	recorderBefore := getGateCheck(t, sessionID)
	var beforeBody map[string]any
	_ = json.NewDecoder(recorderBefore.Body).Decode(&beforeBody)
	if beforeBody["isGateOpen"] != true {
		t.Fatal("pre-condition failed: gate should be open before approve")
	}

	// Submit the decision.
	if _, err := orchestrator.SubmitDecision(sdd.Decision{Phase: sdd.PhasePlan, Action: sdd.ActionApprove}); err != nil {
		t.Fatalf("approve: %v", err)
	}

	// Gate must be closed now.
	recorderAfter := getGateCheck(t, sessionID)
	var afterBody map[string]any
	if err := json.NewDecoder(recorderAfter.Body).Decode(&afterBody); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if afterBody["isGateOpen"] != false {
		t.Errorf("isGateOpen = %v, want false after approve", afterBody["isGateOpen"])
	}
}

// ── gate-check scoping (specs/010-sdd-authoritative-state, US2 / FR-005) ──────

// TestHandleSddGateCheck_ScopedToRequestingSession proves a gate open in one session
// is NOT returned for another — the fix for the global first-match conflation.
func TestHandleSddGateCheck_ScopedToRequestingSession(t *testing.T) {
	bindTestPipeline(t, "gc-a", sdd.PhasePlan)         // gate open on A
	orchestratorB := bindTestPipeline(t, "gc-b", sdd.PhaseSpecify)
	// Resolve B's gate so B is idle while A still has one open.
	if _, err := orchestratorB.SubmitDecision(sdd.Decision{Phase: sdd.PhaseSpecify, Action: sdd.ActionApprove}); err != nil {
		t.Fatalf("approve B: %v", err)
	}

	var bodyB map[string]any
	_ = json.NewDecoder(getGateCheck(t, "gc-b").Body).Decode(&bodyB)
	if bodyB["isGateOpen"] != false {
		t.Errorf("session B isGateOpen = %v, want false — must not see A's gate", bodyB["isGateOpen"])
	}

	var bodyA map[string]any
	_ = json.NewDecoder(getGateCheck(t, "gc-a").Body).Decode(&bodyA)
	if bodyA["isGateOpen"] != true || bodyA["phase"] != "plan" {
		t.Errorf("session A gate-check = %v, want open for plan", bodyA)
	}
}

// TestHandleSddGateCheck_MissingSessionIdIsClosed proves a request with no sessionId
// reports closed rather than scanning all pipelines (the shipped hook always sends one).
func TestHandleSddGateCheck_MissingSessionIdIsClosed(t *testing.T) {
	bindTestPipeline(t, "gc-legacy", sdd.PhasePlan) // a gate is open somewhere

	var body map[string]any
	_ = json.NewDecoder(getGateCheck(t, "").Body).Decode(&body)
	if body["isGateOpen"] != false {
		t.Errorf("isGateOpen = %v with no sessionId, want false (no global scan)", body["isGateOpen"])
	}
}

// ── handleSddHookStatus tests ─────────────────────────────────────────────────

func getHookStatus(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/sdd/hook-status", nil)
	handleSddHookStatus(recorder, req)
	return recorder
}

func TestHandleSddHookStatus_MethodNotAllowed(t *testing.T) {
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/sdd/hook-status", nil)
	handleSddHookStatus(recorder, req)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", recorder.Code)
	}
}

func TestHandleSddHookStatus_AbsentSettingsFile_ReturnsNotInstalled(t *testing.T) {
	// When neither settings file exists (empty path list), the hook is not installed.
	isInstalled := isSddHookInstalledFromPaths([]string{})
	if isInstalled {
		t.Error("isInstalled = true with no settings files, want false")
	}
}

func TestIsSddHookInstalledFromPaths_ProjectSettings_Found(t *testing.T) {
	// A project-level settings file containing the hook script name returns true.
	settingsDir := t.TempDir()
	settingsFile := filepath.Join(settingsDir, "settings.json")
	content := `{"hooks":{"PreToolUse":[{"matcher":"Skill","hooks":[{"type":"command","command":"powershell -File sdd-gate-check.ps1"}]}]}}`
	if err := os.WriteFile(settingsFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	if !isSddHookInstalledFromPaths([]string{settingsFile}) {
		t.Error("isInstalled = false with hook present in project settings, want true")
	}
}

func TestIsSddHookInstalledFromPaths_GlobalSettings_Found(t *testing.T) {
	// A global settings file containing the hook script name returns true even when
	// the project settings file does not contain it.
	globalDir := t.TempDir()
	globalFile := filepath.Join(globalDir, "settings.json")
	content := `{"hooks":{"PreToolUse":[{"matcher":"Skill","hooks":[{"type":"command","command":"C:\\Users\\user\\.claude\\scripts\\sdd-gate-check.ps1"}]}]}}`
	if err := os.WriteFile(globalFile, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	missingProjectFile := filepath.Join(globalDir, "nonexistent.json")
	if !isSddHookInstalledFromPaths([]string{missingProjectFile, globalFile}) {
		t.Error("isInstalled = false with hook present in global settings, want true")
	}
}

func TestIsSddHookInstalledFromPaths_NeitherFile_ReturnsFalse(t *testing.T) {
	// When both settings files lack the hook script name, isInstalled is false.
	settingsDir := t.TempDir()
	projectFile := filepath.Join(settingsDir, "project-settings.json")
	globalFile := filepath.Join(settingsDir, "global-settings.json")
	emptyContent := `{"permissions":{}}`
	if err := os.WriteFile(projectFile, []byte(emptyContent), 0o644); err != nil {
		t.Fatalf("write project fixture: %v", err)
	}
	if err := os.WriteFile(globalFile, []byte(emptyContent), 0o644); err != nil {
		t.Fatalf("write global fixture: %v", err)
	}
	if isSddHookInstalledFromPaths([]string{projectFile, globalFile}) {
		t.Error("isInstalled = true with hook absent from both settings files, want false")
	}
}
