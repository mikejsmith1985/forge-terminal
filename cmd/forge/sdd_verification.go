// sdd_verification.go — the phase-completion verification gate (specs/012 US2/US3/US4).
// Before a phase is presented as complete, the gate checks that behaviour-changing work
// carries Red→Green test evidence (TDD) and that user-facing work carries a passing
// Playwright UX result. The decision is a pure function of an assembled record so it is
// deterministic (FR-019); a check that cannot be satisfied blocks (fail closed, FR-016/017).
package main

import (
	"log"
	"os"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
	"github.com/mikejsmith1985/forge-terminal/internal/workflow"
)

// gateDecision is the verdict for a completing phase.
type gateDecision string

const (
	gatePass   gateDecision = "pass"   // all applicable evidence present and passing.
	gateBlock  gateDecision = "block"  // a required check is missing, failed, or could not run.
	gateExempt gateDecision = "exempt" // docs/refactor-only; no executable behaviour to verify.
)

// phaseVerificationRecord is the evidence set the gate evaluates for one completing phase.
// It is assembled from the phase's touched files (classification), the workflow ledger
// (Red/Green), and the environment (audited bypass). evaluateGate is a pure function of it.
type phaseVerificationRecord struct {
	Phase          string
	Classification sdd.BehaviorClassification
	// RedObserved is when a test was recorded failing (workflow GateTestFailedFirst); zero if never.
	RedObserved time.Time
	// GreenObserved is when tests were recorded passing (workflow GateTestsPassed); zero if never.
	GreenObserved time.Time
	// UXResult carries the Playwright UX outcome (US3); nil until that gate is wired.
	UXResult *uxEvidence
	// Bypassed/BypassReason record an explicit, audited override (FR-020).
	Bypassed     bool
	BypassReason string
	// BlockReason is a short human-readable explanation set when the decision is block.
	BlockReason string
}

// uxEvidence is the Playwright UX validation outcome consumed by the US3 gate.
type uxEvidence struct {
	Ran    bool
	Passed bool
	Output string
}

// evaluateGate is the pure decision function (FR-019/SC-007): identical records yield
// identical decisions. An audited bypass converts a would-be block to a pass; an exempt
// classification passes; a behaviour-changing phase requires Red strictly before Green.
func evaluateGate(record phaseVerificationRecord) gateDecision {
	if record.Bypassed {
		return gatePass // audited, reason-recorded override (FR-020).
	}
	if record.Classification.ExemptReason != "" {
		return gateExempt // docs/refactor only (FR-009).
	}
	// TDD Red→Green gate (US2, FR-007/FR-008): a behaviour change needs a test seen
	// failing strictly before it was seen passing.
	if record.Classification.BehaviorChanging {
		if record.RedObserved.IsZero() || record.GreenObserved.IsZero() || !record.RedObserved.Before(record.GreenObserved) {
			return gateBlock
		}
	}
	// US3 UX gate is layered in here once wired: userFacing requires UXResult ran && passed.
	return gatePass
}

// reasonForBlock returns the human-readable cause of a block, for the report card and logs.
func reasonForBlock(record phaseVerificationRecord) string {
	if !record.Classification.BehaviorChanging {
		return ""
	}
	if record.RedObserved.IsZero() {
		return "no failing test was recorded before implementation (TDD Red→Green required)"
	}
	if record.GreenObserved.IsZero() {
		return "no passing test was recorded after implementation (TDD Red→Green required)"
	}
	if !record.RedObserved.Before(record.GreenObserved) {
		return "the test passed without first being observed to fail (Red must precede Green)"
	}
	return ""
}

// readTddEvidence reads the workflow ledger at projectRoot and returns the earliest Red
// observation and the latest Green observation, so evaluateGate can require Red before Green.
// A missing ledger yields two zero times (the gate then blocks a behaviour change, fail closed).
func readTddEvidence(projectRoot string) (red, green time.Time) {
	ticket, err := workflow.LoadTicket(projectRoot)
	if err != nil || ticket == nil {
		return red, green
	}
	for _, entry := range ticket.Gates {
		switch entry.Gate {
		case workflow.GateTestFailedFirst:
			if red.IsZero() || entry.PassedAt.Before(red) {
				red = entry.PassedAt // earliest Red.
			}
		case workflow.GateTestsPassed:
			if entry.PassedAt.After(green) {
				green = entry.PassedAt // latest Green.
			}
		}
	}
	return red, green
}

// readAuditedBypass reads the explicit, logged escape hatch (FR-020). It mirrors the
// existing workflow-ledger bypass so every override flows through one audited mechanism.
func readAuditedBypass() (bypassed bool, reason string) {
	if os.Getenv("FORGE_BYPASS") == "1" {
		return true, os.Getenv("FORGE_BYPASS_REASON")
	}
	return false, ""
}

// assembleVerificationRecord builds the evidence record for a completing phase from its
// touched files (the same baseline→now diff the report card uses), the workflow ledger,
// and the environment. Scoped to pipeline.repoRoot so an isolated worktree's evidence is
// read from its own ledger (FR-006 isolation).
func assembleVerificationRecord(pipeline *sddPipeline, phase sdd.PhaseName) phaseVerificationRecord {
	touched := diffWorkTrees(pipeline.repoRoot, pipeline.baselineFor(phase), captureWorkTree(pipeline.repoRoot))
	paths := make([]string, 0, len(touched))
	for _, change := range touched {
		paths = append(paths, change.Path)
	}
	red, green := readTddEvidence(pipeline.repoRoot)
	bypassed, reason := readAuditedBypass()
	record := phaseVerificationRecord{
		Phase:          string(phase),
		Classification: sdd.ClassifyBehavior(paths),
		RedObserved:    red,
		GreenObserved:  green,
		Bypassed:       bypassed,
		BypassReason:   reason,
	}
	record.BlockReason = reasonForBlock(record)
	return record
}

// gatedHandlePhaseComplete is the single verification chokepoint both completion paths use
// (the authoritative phase-event and the pty-quiet watcher fallback). On a blocking verdict
// it records the verdict and surfaces the blocked state WITHOUT presenting the phase as
// complete, keeping it open for fix-and-retry (FR-017). On pass/exempt it calls the
// orchestrator's completion seam unchanged.
func gatedHandlePhaseComplete(pipeline *sddPipeline, phase sdd.PhaseName, artifactRel, sessionID string) {
	record := assembleVerificationRecord(pipeline, phase)
	decision := evaluateGate(record)
	pipeline.storeVerification(phase, record, decision)

	if decision == gateBlock {
		log.Printf("[sdd] phase %s blocked by verification gate: %s", phase, record.BlockReason)
		broadcastPhaseStatus(sessionID) // surface the blocked state; the phase stays active.
		return
	}
	pipeline.orchestrator.HandlePhaseComplete(phase, artifactRel)
}
