// orchestrator_test.go — state-machine tests for the gate seam and the approve/reject/clarify
// transitions (US1 + the US2 clarify branch). All ports are mocked; no real time/PTY/socket.
package sdd

import (
	"os"
	"path/filepath"
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

func TestMarkPhaseRunning_TransitionsFromIdleToRunning(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	wasTransitioned := orchestrator.MarkPhaseRunning(PhaseSpecify)

	if !wasTransitioned {
		t.Fatal("MarkPhaseRunning should return true when transitioning from idle")
	}
	state := orchestrator.State()
	if state.Status != StatusRunning {
		t.Errorf("status = %q, want running", state.Status)
	}
	if state.CurrentPhase != PhaseSpecify {
		t.Errorf("CurrentPhase = %q, want specify", state.CurrentPhase)
	}
}

func TestMarkPhaseRunning_IdempotentWhenAlreadyRunning(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.MarkPhaseRunning(PhaseSpecify)

	// Duplicate watcher fire for the same (or any) phase must be suppressed.
	wasTransitioned := orchestrator.MarkPhaseRunning(PhaseSpecify)

	if wasTransitioned {
		t.Fatal("MarkPhaseRunning should return false when pipeline is already in StatusRunning")
	}
	if orchestrator.State().Status != StatusRunning {
		t.Errorf("status must remain running, got %q", orchestrator.State().Status)
	}
}

func TestMarkPhaseRunning_SuppressedWhenAwaitingDecision(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	// Drive orchestrator to AwaitingDecision via the normal completion seam.
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")

	wasTransitioned := orchestrator.MarkPhaseRunning(PhaseSpecify)

	if wasTransitioned {
		t.Fatal("MarkPhaseRunning should return false when a gate card is already open")
	}
	if orchestrator.State().Status != StatusAwaitingDecision {
		t.Errorf("gate-open status must not be overwritten, got %q", orchestrator.State().Status)
	}
}

func TestMarkPhaseRunning_SuppressedWhenPipelineComplete(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseImplement, "")
	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhaseImplement, Action: ActionApprove}); err != nil {
		t.Fatalf("approve terminal phase: %v", err)
	}

	wasTransitioned := orchestrator.MarkPhaseRunning(PhaseSpecify)

	if wasTransitioned {
		t.Fatal("MarkPhaseRunning should return false when pipeline is complete")
	}
	if orchestrator.State().Status != StatusComplete {
		t.Errorf("complete status must not be overwritten, got %q", orchestrator.State().Status)
	}
}

func TestIsPhaseRunning_TrueWhenStatusRunningAndPhaseMatches(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.MarkPhaseRunning(PhaseSpecify)

	if !orchestrator.IsPhaseRunning(PhaseSpecify) {
		t.Error("IsPhaseRunning(specify) = false; want true while pipeline is StatusRunning for specify")
	}
}

func TestIsPhaseRunning_FalseWhenDifferentPhaseIsRunning(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.MarkPhaseRunning(PhaseSpecify)

	if orchestrator.IsPhaseRunning(PhaseClarify) {
		t.Error("IsPhaseRunning(clarify) = true; want false when specify is the running phase")
	}
}

func TestIsPhaseRunning_FalseWhenAwaitingDecision(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")

	if orchestrator.IsPhaseRunning(PhaseSpecify) {
		t.Error("IsPhaseRunning(specify) = true; want false when gate is open (AwaitingDecision)")
	}
}

func TestIsPhaseRunning_FalseWhenIdle(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	if orchestrator.IsPhaseRunning(PhaseSpecify) {
		t.Error("IsPhaseRunning(specify) = true; want false when pipeline is idle")
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

// ── ReconcileFromDisk tests (specs/008 US2) ───────────────────────────────────

func TestReconcileFromDisk_AdvancesPastExistingArtifacts(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()

	// spec.md and plan.md exist on disk; tasks.md does not.
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")

	orchestrator.ReconcileFromDisk(featureDir)

	// Clarify shares spec.md with Specify so the scan advances through both;
	// it then finds plan.md and stops at tasks.md (missing).
	state := orchestrator.State()
	if state.CurrentPhase != PhasePlan {
		t.Errorf("CurrentPhase = %q, want %q (plan.md exists, tasks.md does not)", state.CurrentPhase, PhasePlan)
	}
}

func TestReconcileFromDisk_StopsAtFirstMissingArtifact(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()

	// Only spec.md; plan.md is absent, so scan must stop at Clarify (order 2).
	writeArtifact(t, featureDir, "spec.md", "# spec")

	orchestrator.ReconcileFromDisk(featureDir)

	state := orchestrator.State()
	if state.CurrentPhase != PhaseClarify {
		t.Errorf("CurrentPhase = %q, want %q (stopped at first gap)", state.CurrentPhase, PhaseClarify)
	}
}

func TestReconcileFromDisk_IsIdempotent(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")

	for iteration := 0; iteration < 10; iteration++ {
		orchestrator.ReconcileFromDisk(featureDir)
	}

	state := orchestrator.State()
	if state.CurrentPhase != PhasePlan {
		t.Errorf("CurrentPhase = %q after 10 reconciliations, want plan", state.CurrentPhase)
	}
}

func TestReconcileFromDisk_NeverRewindsCurrentPhase(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")

	orchestrator.ReconcileFromDisk(featureDir)
	// Delete plan.md — the orchestrator must NOT rewind to Clarify.
	if err := os.Remove(filepath.Join(featureDir, "plan.md")); err != nil {
		t.Fatalf("remove plan.md: %v", err)
	}
	orchestrator.ReconcileFromDisk(featureDir)

	state := orchestrator.State()
	if state.CurrentPhase != PhasePlan {
		t.Errorf("CurrentPhase rewound to %q, want plan (reconcile must never rewind)", state.CurrentPhase)
	}
}

func TestReconcileFromDisk_SkipsWhenGateIsOpen(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")
	writeArtifact(t, featureDir, "tasks.md", "# tasks")

	// Open a gate on Specify so status becomes AwaitingDecision.
	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")
	beforePhase := orchestrator.State().CurrentPhase

	orchestrator.ReconcileFromDisk(featureDir)

	// Reconcile must leave the gate untouched.
	state := orchestrator.State()
	if state.Status != StatusAwaitingDecision {
		t.Errorf("status = %q, want awaiting-decision (gate must remain open)", state.Status)
	}
	if state.CurrentPhase != beforePhase {
		t.Errorf("CurrentPhase changed from %q to %q while gate was open", beforePhase, state.CurrentPhase)
	}
}

func TestReconcileFromDisk_SkipsWhenPhaseIsRunning(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")

	// Simulate a running phase (artifact detected but PTY not yet quiet).
	orchestrator.MarkPhaseRunning(PhaseSpecify)

	orchestrator.ReconcileFromDisk(featureDir)

	// Must not advance while the phase is actively running.
	state := orchestrator.State()
	if state.Status != StatusRunning {
		t.Errorf("status = %q, want running", state.Status)
	}
}

func TestReconcileFromDisk_EmptyFeatureDirIsNoOp(t *testing.T) {
	orchestrator, _, _ := newTestOrchestrator(t)

	orchestrator.ReconcileFromDisk("")

	state := orchestrator.State()
	if state.CurrentPhase != "" {
		t.Errorf("CurrentPhase = %q, want empty (no-op on empty featureDir)", state.CurrentPhase)
	}
}

func TestSubmitDecision_ApproveReconcilesBulkPhases(t *testing.T) {
	// Gate is open on Specify; plan.md and tasks.md already exist. Approving once
	// should jump CurrentPhase to Tasks (the artifact frontier), not just Clarify.
	orchestrator, _, _ := newTestOrchestrator(t)
	featureDir := t.TempDir()
	writeArtifact(t, featureDir, "spec.md", "# spec")
	writeArtifact(t, featureDir, "plan.md", "# plan")
	writeArtifact(t, featureDir, "tasks.md", "# tasks")
	orchestrator.SetFeatureDir(featureDir)

	orchestrator.HandlePhaseComplete(PhaseSpecify, "spec.md")
	if _, err := orchestrator.SubmitDecision(Decision{Phase: PhaseSpecify, Action: ActionApprove}); err != nil {
		t.Fatalf("approve specify: %v", err)
	}

	state := orchestrator.State()
	if state.CurrentPhase != PhaseTasksGenerate {
		t.Errorf("CurrentPhase = %q, want tasks (bulk-advance to artifact frontier)", state.CurrentPhase)
	}
}
