// Package sdd implements the Spec-Driven Development phase orchestrator: it watches a
// feature directory for phase artifacts, presents an in-terminal decision card after each
// gated phase, and advances, stops, or steers the pipeline based on the developer's choice.
// See specs/003-sdd-phase-orchestrator for the design.
//
// types.go holds the core domain types (see data-model.md).
package sdd

import "time"

// PhaseName identifies one of the five gated pipeline phases.
type PhaseName string

const (
	PhaseSpecify   PhaseName = "specify"
	PhaseClarify   PhaseName = "clarify"
	PhasePlan      PhaseName = "plan"
	PhaseValidate  PhaseName = "validate"
	PhaseImplement PhaseName = "implement"
)

// CompletionSignal describes how a phase's completion is detected.
type CompletionSignal string

const (
	// signalArtifactExists: a new artifact file appears and settles (Specify, Plan).
	signalArtifactExists CompletionSignal = "artifact-exists"
	// signalContentMarker: an existing artifact gains a marker section (Clarify).
	signalContentMarker CompletionSignal = "content-marker"
	// signalPTYQuiet: a report-only / code-producing command settles (Validate, Implement).
	signalPTYQuiet CompletionSignal = "pty-quiet"
)

// Phase is one stage of the pipeline and the rules for detecting and advancing it.
type Phase struct {
	Name             PhaseName
	Order            int    // 1-based position in the pipeline
	StartCommand     string // slash command that STARTS this phase, e.g. "/speckit-plan"
	CompletionSignal CompletionSignal
	ExpectedArtifact string // feature-relative path; "" when the phase writes no artifact
	IsTerminal       bool   // true for the final phase (Approve completes, not advances)
}

// Severity ranks a flag's importance on the card.
type Severity string

const (
	SeverityInfo  Severity = "info"
	SeverityWarn  Severity = "warn"
	SeverityBlock Severity = "block"
)

// FlagKind categorizes a flagged risk or gap.
type FlagKind string

const (
	FlagUncheckedChecklist FlagKind = "unchecked-checklist"
	FlagOpenClarification  FlagKind = "open-clarification"
	FlagMissingArtifact    FlagKind = "missing-artifact"
)

// Flag is a single risk/gap surfaced on the card.
type Flag struct {
	Kind     FlagKind `json:"kind"`
	Label    string   `json:"label"`
	Severity Severity `json:"severity"`
}

// PhaseSummary is the deterministically derived card content (FR-017): never generated.
type PhaseSummary struct {
	Headline      string   `json:"headline"`
	ProducedItems []string `json:"producedItems"`
	Flags         []Flag   `json:"flags"`
}

// Action is the developer's choice on a card.
type Action string

const (
	ActionApprove Action = "approve"
	ActionReject  Action = "reject"
	ActionClarify Action = "clarify"
)

// allActions is the fixed set of actions every card offers (FR-006).
var allActions = []Action{ActionApprove, ActionReject, ActionClarify}

// CardStatus tracks whether a card still needs a decision.
type CardStatus string

const (
	CardPending  CardStatus = "pending"
	CardResolved CardStatus = "resolved"
)

// DecisionCard is the in-terminal review surface shown after a phase (one at a time, FR-014).
type DecisionCard struct {
	ID        string       `json:"cardId"`
	SessionID string       `json:"sessionId"`
	Phase     PhaseName    `json:"phase"`
	Summary   PhaseSummary `json:"summary"`
	Actions   []Action     `json:"actions"`
	Status    CardStatus   `json:"-"`
}

// Decision is the developer's response to a card, recorded for audit (FR-015).
type Decision struct {
	Phase       PhaseName `json:"phase"`
	Action      Action    `json:"action"`
	ClarifyText string    `json:"clarifyText,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
}

// NotificationEvent is the best-effort message sent to AzureWorkflowPOC (FR-011).
type NotificationEvent struct {
	Feature      string `json:"feature"`
	Phase        string `json:"phase"`
	ArtifactPath string `json:"artifactPath"`
	Timestamp    string `json:"timestamp"`
}

// PipelineStatus is the orchestrator's state-machine status.
type PipelineStatus string

const (
	StatusIdle             PipelineStatus = "idle"
	StatusAwaitingDecision PipelineStatus = "awaiting-decision"
	StatusAdvancing        PipelineStatus = "advancing"
	StatusRejected         PipelineStatus = "rejected"
	StatusComplete         PipelineStatus = "complete"
)

// PipelineState is the orchestrator's in-memory state for one active pipeline (v1: single).
type PipelineState struct {
	FeatureDir   string
	SessionID    string
	CurrentPhase PhaseName
	PendingCard  *DecisionCard
	Status       PipelineStatus
}

// PhaseDisplayStatus is the UI-facing status of a single pipeline phase shown in
// the SddPipelinePanel (specs/004-sdd-pipeline-dashboard).
type PhaseDisplayStatus string

const (
	PhaseDisplayPending          PhaseDisplayStatus = "pending"
	PhaseDisplayActive           PhaseDisplayStatus = "active"
	PhaseDisplayAwaitingDecision PhaseDisplayStatus = "awaiting-decision"
	PhaseDisplayComplete         PhaseDisplayStatus = "complete"
	PhaseDisplayRejected         PhaseDisplayStatus = "rejected"
	// PhaseDisplayIterating fires when a gate card re-opens for a phase that has already
	// completed at least once (RunCount ≥ 2), disambiguating re-runs from first runs.
	PhaseDisplayIterating PhaseDisplayStatus = "iterating"
)

// PhaseStatusEntry is one row in the SDD_PHASE_STATUS WebSocket event, representing
// the current display state of a single pipeline phase.
type PhaseStatusEntry struct {
	Phase         PhaseName          `json:"phase"`
	Order         int                `json:"order"`
	DisplayStatus PhaseDisplayStatus `json:"displayStatus"`
	ArtifactPath  string             `json:"artifactPath"`
	DecidedAt     *time.Time         `json:"decidedAt"`
	// RunCount is the total number of times HandlePhaseComplete has fired for this phase
	// in the current session. 0 = never run; 1 = completed once; ≥2 = iterated.
	// Frontend shows ×N only when N ≥ 2. Omitted (zero) if absent for backward compat.
	RunCount int `json:"runCount,omitempty"`
}
