// orchestrator_test.go — state-machine tests for the gate seam and the approve/reject/clarify
// transitions (US1 + the US2 clarify branch). All ports are mocked; no real time/PTY/socket.
package sdd

import (
	"testing"
	"time"
)

type mockInjector struct{ calls []injectCall }

type injectCall struct{ sessionID, text string }

func (m *mockInjector) InjectCommand(sessionID, text string) error {
	m.calls = append(m.calls, injectCall{sessionID, text})
	return nil
}

type mockBroadcaster struct{ cards []DecisionCard }

func (m *mockBroadcaster) BroadcastGate(card DecisionCard) error {
	m.cards = append(m.cards, card)
	return nil
}

func newTestOrchestrator(t *testing.T) (*Orchestrator, *mockInjector, *mockBroadcaster) {
	t.Helper()
	injector := &mockInjector{}
	broadcaster := &mockBroadcaster{}
	orchestrator := NewOrchestrator(Options{
		Feature:        "demo",
		SessionID:      "sess-1",
		HistoryBaseDir: t.TempDir(),
		Injector:       injector,
		Broadcaster:    broadcaster,
		Summarize:      func(PhaseName) PhaseSummary { return PhaseSummary{Headline: "H"} },
		Now:            func() time.Time { return time.Unix(0, 0) },
		NewCardID:      func(phase PhaseName) string { return "card-" + string(phase) },
	})
	return orchestrator, injector, broadcaster
}

func TestHandlePhaseComplete_BroadcastsAndSetsPendingCard(t *testing.T) {
	orchestrator, _, broadcaster := newTestOrchestrator(t)

	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	if len(broadcaster.cards) != 1 {
		t.Fatalf("expected 1 broadcast, got %d", len(broadcaster.cards))
	}
	if broadcaster.cards[0].Phase != PhasePlan {
		t.Errorf("broadcast phase = %q, want plan", broadcaster.cards[0].Phase)
	}
	state := orchestrator.State()
	if state.Status != StatusAwaitingDecision || state.PendingCard == nil {
		t.Errorf("state = %q pending=%v, want awaiting-decision with a card", state.Status, state.PendingCard)
	}
}

func TestSubmitDecision_ApproveAdvancesByInjectingNextCommand(t *testing.T) {
	orchestrator, injector, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	status, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionApprove})
	if err != nil {
		t.Fatalf("approve failed: %v", err)
	}
	if status != StatusAdvancing {
		t.Errorf("status = %q, want advancing", status)
	}
	if len(injector.calls) != 1 || injector.calls[0].text != "/speckit-tasks" {
		t.Fatalf("expected injection of /speckit-tasks, got %+v", injector.calls)
	}
	if injector.calls[0].sessionID != "sess-1" {
		t.Errorf("injected into %q, want sess-1", injector.calls[0].sessionID)
	}
	if orchestrator.State().PendingCard != nil {
		t.Errorf("pending card should be cleared after approve")
	}
}

func TestSubmitDecision_RejectStopsWithoutInjecting(t *testing.T) {
	orchestrator, injector, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	status, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionReject})
	if err != nil {
		t.Fatalf("reject failed: %v", err)
	}
	if status != StatusRejected {
		t.Errorf("status = %q, want rejected", status)
	}
	if len(injector.calls) != 0 {
		t.Errorf("reject must not inject anything, got %+v", injector.calls)
	}
}

func TestSubmitDecision_ClarifyAppendsSteer(t *testing.T) {
	orchestrator, injector, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	_, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionClarify, ClarifyText: "narrow scope"})
	if err != nil {
		t.Fatalf("clarify failed: %v", err)
	}
	want := "/speckit-tasks\nnarrow scope"
	if len(injector.calls) != 1 || injector.calls[0].text != want {
		t.Fatalf("clarify injection = %+v, want text %q", injector.calls, want)
	}
}

func TestSubmitDecision_ClarifyEmptyTextIsRejected(t *testing.T) {
	orchestrator, injector, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	_, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionClarify, ClarifyText: "   "})
	if err != ErrEmptyClarify {
		t.Fatalf("empty clarify err = %v, want ErrEmptyClarify", err)
	}
	if len(injector.calls) != 0 {
		t.Errorf("empty clarify must not inject, got %+v", injector.calls)
	}
}

func TestSubmitDecision_TerminalPhaseCompletes(t *testing.T) {
	orchestrator, injector, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseImplement, "")

	status, err := orchestrator.SubmitDecision(Decision{Phase: PhaseImplement, Action: ActionApprove})
	if err != nil {
		t.Fatalf("approve terminal failed: %v", err)
	}
	if status != StatusComplete {
		t.Errorf("status = %q, want complete", status)
	}
	if len(injector.calls) != 0 {
		t.Errorf("terminal approve must not inject a next command, got %+v", injector.calls)
	}
}

func TestSubmitDecision_NoPendingCard(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionApprove}); err != ErrNoPendingCard {
		t.Fatalf("err = %v, want ErrNoPendingCard", err)
	}
}

func TestSubmitDecision_PhaseMismatch(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhaseSpecify, Action: ActionApprove}); err != ErrCardMismatch {
		t.Fatalf("err = %v, want ErrCardMismatch", err)
	}
}

func TestSubmitDecision_AdvanceToPtyQuietPhaseGatesAfterWait(t *testing.T) {
	gatedPhases := make(chan PhaseName, 4)
	waiterCalls := make(chan PhaseName, 4)
	orchestrator := NewOrchestrator(Options{
		Feature:        "demo",
		SessionID:      "sess-1",
		HistoryBaseDir: t.TempDir(),
		Injector:       InjectorFunc(func(string, string) error { return nil }),
		Broadcaster:    BroadcasterFunc(func(card DecisionCard) error { gatedPhases <- card.Phase; return nil }),
		Waiter:         WaiterFunc(func(_ string, phase PhaseName) { waiterCalls <- phase }),
		Summarize:      func(PhaseName) PhaseSummary { return PhaseSummary{Headline: "H"} },
		NewCardID:      func(phase PhaseName) string { return "card-" + string(phase) },
	})

	// Approve Tasks (file-detected) — the first pty-quiet phase in the pipeline is now Validate.
	// Manually simulate the file-watcher delivering tasks.md so the orchestrator gates on tasks.
	orchestrator.HandlePhaseComplete(PhaseTasksGenerate, "tasks.md")
	if got := <-gatedPhases; got != PhaseTasksGenerate {
		t.Fatalf("first gate = %s, want tasks", got)
	}
	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhaseTasksGenerate, Action: ActionApprove}); err != nil {
		t.Fatalf("approve tasks failed: %v", err)
	}

	// The waiter must be asked to wait for Validate (the first pty-quiet phase), and once it
	// returns the orchestrator gates on Validate.
	select {
	case phase := <-waiterCalls:
		if phase != PhaseValidate {
			t.Errorf("waiter asked for %s, want validate", phase)
		}
	case <-time.After(time.Second):
		t.Fatal("waiter was not scheduled for the pty-quiet Validate phase")
	}
	select {
	case phase := <-gatedPhases:
		if phase != PhaseValidate {
			t.Errorf("gated %s after wait, want validate", phase)
		}
	case <-time.After(time.Second):
		t.Fatal("Validate did not gate after the pty-quiet wait returned")
	}
}

// T003 — run-count tracking (Red until T004 adds phaseRunCounts to Orchestrator).

func TestPhaseRunCount_ZeroBeforeAnyCompletion(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	if got := orchestrator.PhaseRunCount(PhaseSpecify); got != 0 {
		t.Errorf("PhaseRunCount before any completion = %d, want 0", got)
	}
}

func TestPhaseRunCount_OneAfterFirstHandlePhaseComplete(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")

	if got := orchestrator.PhaseRunCount(PhaseSpecify); got != 1 {
		t.Errorf("PhaseRunCount after first completion = %d, want 1", got)
	}
}

func TestPhaseRunCount_TwoAfterSecondHandlePhaseComplete(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")

	if got := orchestrator.PhaseRunCount(PhaseSpecify); got != 2 {
		t.Errorf("PhaseRunCount after second completion = %d, want 2", got)
	}
}

func TestPhaseRunCount_IndependentPerPhase(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")

	if got := orchestrator.PhaseRunCount(PhaseSpecify); got != 2 {
		t.Errorf("specify run count = %d, want 2", got)
	}
	if got := orchestrator.PhaseRunCount(PhasePlan); got != 1 {
		t.Errorf("plan run count = %d, want 1", got)
	}
	if got := orchestrator.PhaseRunCount(PhaseClarify); got != 0 {
		t.Errorf("clarify run count (never run) = %d, want 0", got)
	}
}

func TestSetFeatureDir_UpdatesStateForLazyActivation(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	if orchestrator.State().FeatureDir != "" {
		t.Fatalf("expected empty feature dir before lazy activation, got %q", orchestrator.State().FeatureDir)
	}
	orchestrator.SetFeatureDir("specs/003-demo")
	if got := orchestrator.State().FeatureDir; got != "specs/003-demo" {
		t.Errorf("feature dir = %q, want specs/003-demo after SetFeatureDir", got)
	}
}

func TestSubmitDecision_RecordsHistory(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhasePlan, "plan.md")
	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhasePlan, Action: ActionApprove}); err != nil {
		t.Fatalf("approve failed: %v", err)
	}

	records, err := loadHistory(orchestrator.historyBaseDir, "demo")
	if err != nil {
		t.Fatalf("load history: %v", err)
	}
	if len(records) != 1 || records[0].Action != ActionApprove {
		t.Fatalf("history = %+v, want one approve record", records)
	}
}
