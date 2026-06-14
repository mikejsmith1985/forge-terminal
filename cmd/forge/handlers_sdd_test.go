// handlers_sdd_test.go — verifies POST /api/sdd/decision maps decisions and errors to the
// right status codes (contract: sdd-decision-endpoint.md). The orchestrator is real but its
// ports (injector/broadcaster) are mocked via the exported func adapters.
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

func setupSddHandler(t *testing.T) {
	t.Helper()
	orchestrator := sdd.NewOrchestrator(sdd.Options{
		Feature:        "demo",
		SessionID:      "sess-1",
		HistoryBaseDir: t.TempDir(),
		Injector:       sdd.InjectorFunc(func(string, string) error { return nil }),
		Broadcaster:    sdd.BroadcasterFunc(func(sdd.DecisionCard) error { return nil }),
		Summarize:      func(sdd.PhaseName) sdd.PhaseSummary { return sdd.PhaseSummary{Headline: "H"} },
		NewCardID:      func(phase sdd.PhaseName) string { return "card-" + string(phase) },
	})
	orchestrator.HandlePhaseComplete(sdd.PhasePlan, "plan.md")
	sddOrchestrator = orchestrator
	t.Cleanup(func() { sddOrchestrator = nil })
}

func postDecision(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/sdd/decision", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handleSddDecision(recorder, request)
	return recorder
}

func TestHandleSddDecision_ApproveReturns200(t *testing.T) {
	setupSddHandler(t)

	recorder := postDecision(t, `{"sessionId":"sess-1","cardId":"card-plan","phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "advancing") {
		t.Errorf("body = %s, want status advancing", recorder.Body.String())
	}
}

func TestHandleSddDecision_RejectReturns200(t *testing.T) {
	setupSddHandler(t)

	recorder := postDecision(t, `{"cardId":"card-plan","phase":"plan","action":"reject"}`)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "rejected") {
		t.Errorf("body = %s, want status rejected", recorder.Body.String())
	}
}

func TestHandleSddDecision_StaleCardIdReturns409(t *testing.T) {
	setupSddHandler(t)

	recorder := postDecision(t, `{"cardId":"card-stale","phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409; body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestHandleSddDecision_NoPipelineReturns409(t *testing.T) {
	sddOrchestrator = nil

	recorder := postDecision(t, `{"phase":"plan","action":"approve"}`)

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", recorder.Code)
	}
}
