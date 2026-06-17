// orchestrator.go — the pipeline state machine. HandlePhaseComplete is the shared
// completion seam: it records the completion and fans out to subscribers, so the card
// (US1) and the notification (US3) consume the same event independently. SubmitDecision
// applies the approve/reject/clarify transitions (data-model.md state diagram).
package sdd

import (
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// Decision-handling errors, returned to the HTTP layer for precise status codes.
var (
	ErrNoPendingCard = errors.New("sdd: no pending decision card")
	ErrCardMismatch  = errors.New("sdd: decision does not match the pending card")
	ErrEmptyClarify  = errors.New("sdd: clarify requires non-empty text")
	ErrUnknownAction = errors.New("sdd: unknown action")
)

// CompletionHandler is invoked once per phase completion via the shared seam.
type CompletionHandler func(phase PhaseName, artifactPath string)

// Options configures a new Orchestrator. Function fields are injected so unit tests run
// fully mocked and deterministic (no real time, files, PTY, or sockets).
type Options struct {
	Feature        string
	FeatureDir     string
	SessionID      string
	HistoryBaseDir string
	Injector       CommandInjector
	Broadcaster    GateBroadcaster
	Waiter         CompletionWaiter
	Summarize      func(PhaseName) PhaseSummary
	Now            func() time.Time
	NewCardID      func(PhaseName) string
}

// Orchestrator holds the single active pipeline's state and drives its transitions.
type Orchestrator struct {
	mu              sync.Mutex
	state           PipelineState
	feature         string
	historyBaseDir  string
	injector        CommandInjector
	broadcaster     GateBroadcaster
	waiter          CompletionWaiter
	newSummary      func(PhaseName) PhaseSummary
	now             func() time.Time
	newCardID       func(PhaseName) string
	subscribers     []CompletionHandler
	// phaseRunCounts tracks how many times HandlePhaseComplete has fired per phase.
	// Incremented under mu before fan-out so subscribers see the updated count.
	phaseRunCounts  map[PhaseName]int
}

// NewOrchestrator builds an orchestrator with sensible production defaults and registers
// the card-presentation subscriber (US1). Additional subscribers (e.g. US3 notify) attach
// via Subscribe and remain independent of one another.
func NewOrchestrator(opts Options) *Orchestrator {
	orchestrator := &Orchestrator{
		feature:        opts.Feature,
		historyBaseDir: opts.HistoryBaseDir,
		injector:       opts.Injector,
		broadcaster:    opts.Broadcaster,
		waiter:         opts.Waiter,
		newSummary:     opts.Summarize,
		now:            opts.Now,
		newCardID:      opts.NewCardID,
		state:          PipelineState{FeatureDir: opts.FeatureDir, SessionID: opts.SessionID, Status: StatusIdle},
		phaseRunCounts: make(map[PhaseName]int),
	}
	if orchestrator.now == nil {
		orchestrator.now = time.Now
	}
	if orchestrator.newCardID == nil {
		orchestrator.newCardID = func(phase PhaseName) string {
			return fmt.Sprintf("gate-%s-%d", phase, orchestrator.now().UnixNano())
		}
	}
	if orchestrator.newSummary == nil {
		orchestrator.newSummary = func(phase PhaseName) PhaseSummary {
			return summarize(phase, osFileSource(orchestrator.state.FeatureDir))
		}
	}
	orchestrator.Subscribe(orchestrator.presentCard)
	return orchestrator
}

// Subscribe registers a handler called on every phase completion (the shared seam, I1).
func (o *Orchestrator) Subscribe(handler CompletionHandler) {
	o.mu.Lock()
	o.subscribers = append(o.subscribers, handler)
	o.mu.Unlock()
}

// BindSession records the terminal session this pipeline advances into, on first gate only.
func (o *Orchestrator) BindSession(sessionID string) {
	o.mu.Lock()
	if o.state.SessionID == "" {
		o.state.SessionID = sessionID
	}
	o.mu.Unlock()
}

// SetFeatureDir points the orchestrator at the feature directory whose artifacts it should
// summarize. This supports eager-bind/lazy-watch: a pipeline can be bound to a repo before any
// feature exists, then have its feature directory set the moment the watcher detects the first
// phase artifact (and re-set if the developer later moves on to a new feature).
func (o *Orchestrator) SetFeatureDir(featureDir string) {
	o.mu.Lock()
	o.state.FeatureDir = featureDir
	o.mu.Unlock()
}

// State returns a snapshot of the current pipeline state (for the HTTP layer and tests).
func (o *Orchestrator) State() PipelineState {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.state
}

// HandlePhaseComplete is the shared completion seam: record the phase, then fan out to all
// subscribers. It performs no card or notification work itself, keeping US1 and US3 decoupled.
func (o *Orchestrator) HandlePhaseComplete(phase PhaseName, artifactPath string) {
	o.mu.Lock()
	o.state.CurrentPhase = phase
	o.phaseRunCounts[phase]++
	subscribers := append([]CompletionHandler(nil), o.subscribers...)
	o.mu.Unlock()

	for _, handler := range subscribers {
		handler(phase, artifactPath)
	}
}

// PhaseRunCount returns the number of times HandlePhaseComplete has fired for phase in
// this session. Returns 0 before the phase has ever completed.
func (o *Orchestrator) PhaseRunCount(phase PhaseName) int {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.phaseRunCounts[phase]
}

// presentCard is the US1 subscriber: derive the summary, set the single pending card, and
// broadcast it to the frontend (FR-014, FR-004).
func (o *Orchestrator) presentCard(phase PhaseName, _ string) {
	summary := o.newSummary(phase)

	o.mu.Lock()
	card := DecisionCard{
		ID:        o.newCardID(phase),
		SessionID: o.state.SessionID,
		Phase:     phase,
		Summary:   summary,
		Actions:   append([]Action(nil), allActions...),
		Status:    CardPending,
	}
	o.state.PendingCard = &card
	o.state.Status = StatusAwaitingDecision
	o.mu.Unlock()

	if o.broadcaster != nil {
		if err := o.broadcaster.BroadcastGate(card); err != nil {
			log.Printf("[sdd] failed to broadcast gate for %s: %v", phase, err)
		}
	}
}

// SubmitDecision validates and applies a decision, then performs the side effects (record
// to history, inject the next command) outside the lock so a blocking injection cannot stall
// the state machine.
func (o *Orchestrator) SubmitDecision(decision Decision) (PipelineStatus, error) {
	command, sessionID, nextPhase, status, err := o.planDecision(decision)
	if err != nil {
		return "", err
	}

	o.record(decision)

	if command != "" && o.injector != nil {
		if injectErr := o.injector.InjectCommand(sessionID, command); injectErr != nil {
			return "", injectErr
		}
	}
	o.scheduleQuietDetection(sessionID, nextPhase)
	return status, nil
}

// scheduleQuietDetection gates a phase that writes no artifact (Validate/Implement): once its
// command has been injected, wait (off the request goroutine) for the terminal to settle, then
// fire the shared completion seam. A no-op for file-detected phases and when no waiter is wired.
func (o *Orchestrator) scheduleQuietDetection(sessionID string, nextPhase PhaseName) {
	phase, found := PhaseByName(nextPhase)
	if !found || phase.CompletionSignal != signalPTYQuiet || o.waiter == nil {
		return
	}
	go func() {
		o.waiter.WaitForPhase(sessionID, nextPhase)
		o.HandlePhaseComplete(nextPhase, "")
	}()
}

// planDecision validates the decision against the pending card and mutates state under the
// lock, returning the command to inject (empty for reject/terminal), the target session, and
// the phase being advanced to (empty for reject/terminal).
func (o *Orchestrator) planDecision(decision Decision) (command, sessionID string, nextPhase PhaseName, status PipelineStatus, err error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	card := o.state.PendingCard
	if card == nil {
		return "", "", "", "", ErrNoPendingCard
	}
	if card.Phase != decision.Phase {
		return "", "", "", "", ErrCardMismatch
	}

	if decision.Action == ActionReject {
		o.state.PendingCard = nil
		o.state.Status = StatusRejected
		return "", "", "", StatusRejected, nil
	}
	if decision.Action != ActionApprove && decision.Action != ActionClarify {
		return "", "", "", "", ErrUnknownAction
	}
	if decision.Action == ActionClarify && strings.TrimSpace(decision.ClarifyText) == "" {
		return "", "", "", "", ErrEmptyClarify
	}

	next, hasNext := NextPhaseAfter(decision.Phase)
	o.state.PendingCard = nil
	if !hasNext {
		o.state.Status = StatusComplete
		return "", "", "", StatusComplete, nil
	}
	o.state.Status = StatusAdvancing
	return nextCommand(next, decision), o.state.SessionID, next.Name, StatusAdvancing, nil
}

// nextCommand returns the command that starts the next phase, appending the clarify steer
// on its own line when the developer chose Clarify (FR-018).
func nextCommand(next Phase, decision Decision) string {
	if decision.Action == ActionClarify {
		return next.StartCommand + "\n" + strings.TrimSpace(decision.ClarifyText)
	}
	return next.StartCommand
}

// record stamps and appends the decision to history; a persistence failure is logged, not
// fatal, so an audit-write problem never blocks the pipeline.
func (o *Orchestrator) record(decision Decision) {
	if decision.Timestamp.IsZero() {
		decision.Timestamp = o.now()
	}
	if err := appendDecision(o.historyBaseDir, o.feature, decision); err != nil {
		log.Printf("[sdd] failed to record decision for %s: %v", decision.Phase, err)
	}
}
