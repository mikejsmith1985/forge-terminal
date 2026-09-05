// Package workflow — ticket.go: per-task gate ledger that runtime hooks read.
//
// The ticket lives at .forge/workflow-ticket.json inside each project root.
// Every gate the agent claims to have passed (e.g. "branch-created",
// "tests-written", "tests-passed") is recorded with a timestamp and an
// optional evidence string.  The pre-commit hook reads the same file and
// blocks the commit if any required gate is missing.
//
// The ticket model is intentionally small: an array of GateRecord entries
// plus a few task-level fields.  Anything more elaborate (flow graph,
// per-file evidence, etc.) belongs in a future iteration.
package workflow

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// TicketFilename is the on-disk name of the per-project ticket file.
const TicketFilename = "workflow-ticket.json"

// TicketDir is the directory (relative to project root) that holds the ticket.
const TicketDir = ".forge"

// RequiredGates lists the gates a commit MUST pass before being allowed.
// The pre-commit hook fails any commit whose ticket is missing any of these.
var RequiredGates = []string{
	GateBranchCreated,
	GateTestsWritten,
	GateTestsPassed,
	GateBriefPublished,
}

// Gate identifiers.  Use string constants so callers cannot typo them.
const (
	GateBranchCreated  = "branch-created"
	GatePlanRecorded   = "plan-recorded"
	GateTestFailedFirst = "test-failed-first"
	GateTestsWritten   = "tests-written"
	GateTestsPassed    = "tests-passed"
	GateUXValidated    = "ux-validated"
	GateBuildPassed    = "build-passed"
	GateChangelogBumped = "changelog-bumped"
	// GateBriefPublished proves a change brief was published for the task, so a
	// change cannot be committed without the developer having something to look
	// at.  Prose cannot be gated — a full-screen CLI leaves screen redraws in the
	// terminal buffer, not a transcript — but the presence of a published
	// document is a fact, and a fact can be required.
	GateBriefPublished = "brief-published"
)

// GateRecord is a single entry in the ticket's gate ledger.
type GateRecord struct {
	// Gate is the gate identifier (one of the Gate* constants).
	Gate string `json:"gate"`
	// PassedAt is the wall-clock time the agent claimed the gate passed.
	PassedAt time.Time `json:"passedAt"`
	// Evidence is a short human-readable string ("ran 'go test ./...'",
	// "branch=feature/foo", etc.).  Required — empty evidence is rejected.
	Evidence string `json:"evidence"`
}

// Ticket is the on-disk shape of .forge/workflow-ticket.json.
type Ticket struct {
	// TaskID is a free-form identifier the agent assigns at task start.
	// It lets us tell two consecutive task runs apart in the ledger.
	TaskID string `json:"taskId"`
	// Branch is the git branch the work targets.  Stored so the hook
	// can verify the current HEAD matches what the agent recorded.
	Branch string `json:"branch"`
	// StartedAt is when this ticket was first opened.
	StartedAt time.Time `json:"startedAt"`
	// UpdatedAt is bumped on every record.
	UpdatedAt time.Time `json:"updatedAt"`
	// Gates is the append-only ledger of gates the agent has recorded.
	Gates []GateRecord `json:"gates"`
}

// ticketPath returns the absolute path of the ticket file for a project root.
func ticketPath(projectRoot string) string {
	return filepath.Join(projectRoot, TicketDir, TicketFilename)
}

// LoadTicket reads the ticket for a project root.  When the file is missing
// it returns (nil, nil) — callers treat that as "no work in flight".
func LoadTicket(projectRoot string) (*Ticket, error) {
	path := ticketPath(projectRoot)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading ticket: %w", err)
	}
	var ticket Ticket
	if err := json.Unmarshal(data, &ticket); err != nil {
		return nil, fmt.Errorf("parsing ticket: %w", err)
	}
	return &ticket, nil
}

// SaveTicket writes the ticket to disk, creating .forge/ if needed.
// UpdatedAt is bumped automatically.
func SaveTicket(projectRoot string, ticket *Ticket) error {
	if ticket == nil {
		return errors.New("cannot save nil ticket")
	}
	ticket.UpdatedAt = time.Now().UTC()
	if ticket.StartedAt.IsZero() {
		ticket.StartedAt = ticket.UpdatedAt
	}
	dir := filepath.Join(projectRoot, TicketDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("creating ticket dir: %w", err)
	}
	body, err := json.MarshalIndent(ticket, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding ticket: %w", err)
	}
	tmp := ticketPath(projectRoot) + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return fmt.Errorf("writing ticket tmp: %w", err)
	}
	return os.Rename(tmp, ticketPath(projectRoot))
}

// RecordGate appends a gate pass to the ticket, creating the ticket if the
// project has never had one.  Empty gate name or evidence is rejected so the
// ledger never carries placeholder entries.
func RecordGate(projectRoot, taskID, gate, evidence string) (*Ticket, error) {
	gate = strings.TrimSpace(gate)
	evidence = strings.TrimSpace(evidence)
	if gate == "" {
		return nil, errors.New("gate name is required")
	}
	if evidence == "" {
		return nil, errors.New("evidence is required so reviewers can audit gate passes")
	}
	ticket, err := LoadTicket(projectRoot)
	if err != nil {
		return nil, err
	}
	if ticket == nil || (taskID != "" && ticket.TaskID != taskID) {
		// New task starts a fresh ledger so gate evidence cannot leak across tasks.
		// The branch is stamped here rather than left to the caller, because a
		// ticket that does not know its branch cannot be told apart from a stale
		// one — and preflight refuses those.
		ticket = &Ticket{TaskID: taskID, Branch: CurrentBranch(projectRoot), StartedAt: time.Now().UTC()}
	}
	// Keep the hook installed on every record, not only when a ticket is
	// opened: repositories scaffolded before the gate learned where git looks
	// migrate the next time anything is recorded. Best-effort here — a
	// hook-install failure must not stop evidence being written — and the MCP
	// tool reports it separately so it is never silent.
	_ = EnsureHookInstalled(projectRoot)
	ticket.Gates = append(ticket.Gates, GateRecord{
		Gate:     gate,
		PassedAt: time.Now().UTC(),
		Evidence: evidence,
	})
	if err := SaveTicket(projectRoot, ticket); err != nil {
		return nil, err
	}
	return ticket, nil
}

// PreflightResult is the outcome of a pre-flight compliance check.
type PreflightResult struct {
	// OK is true when every gate in RequiredGates appears in the ticket.
	OK bool `json:"ok"`
	// MissingGates lists required gates that have not been recorded.
	MissingGates []string `json:"missingGates"`
	// Branch is the branch the ticket targets (empty when no ticket exists).
	Branch string `json:"branch"`
	// HeadBranch is the branch the repository is actually on, so a refusal
	// for a branch mismatch can show both sides. Empty outside a repository.
	HeadBranch string `json:"headBranch,omitempty"`
	// TaskID is the task identifier on the ticket (empty when none).
	TaskID string `json:"taskId"`
	// Reason is a single human-readable summary suitable for an error message.
	Reason string `json:"reason"`
}

// Preflight evaluates the current ticket against RequiredGates.  When the
// ticket is missing or incomplete, the result's Reason explains why.
//
// The pre-commit hook calls this same function via the MCP tool
// workflow_preflight_check, so the CLI and the hook stay in lockstep.
func Preflight(projectRoot string) (*PreflightResult, error) {
	return preflightAgainst(projectRoot, RequiredGates)
}

// preflightAgainst evaluates the ticket against a specific set of gates.
//
// Split out so the pre-commit path can ask a narrower question — a change with
// no source in it owes no brief — without duplicating the ledger reading, which
// is the part that must never differ between the CLI and the hook.
func preflightAgainst(projectRoot string, requiredGates []string) (*PreflightResult, error) {
	ticket, err := LoadTicket(projectRoot)
	if err != nil {
		return nil, err
	}
	if ticket == nil {
		return &PreflightResult{
			OK:           false,
			MissingGates: append([]string{}, requiredGates...),
			Reason:       "no workflow ticket exists — call workflow_gate_record before committing",
		}, nil
	}
	recorded := make(map[string]bool, len(ticket.Gates))
	for _, gateRecord := range ticket.Gates {
		recorded[gateRecord.Gate] = true
	}
	var missing []string
	for _, requiredGate := range requiredGates {
		if !recorded[requiredGate] {
			missing = append(missing, requiredGate)
		}
	}
	sort.Strings(missing)
	headBranch := CurrentBranch(projectRoot)
	if len(missing) > 0 {
		return &PreflightResult{
			OK:           false,
			MissingGates: missing,
			Branch:       ticket.Branch,
			HeadBranch:   headBranch,
			TaskID:       ticket.TaskID,
			Reason:       "missing gates: " + strings.Join(missing, ", "),
		}, nil
	}
	if reason := branchMismatchReason(ticket.Branch, headBranch); reason != "" {
		return &PreflightResult{
			OK:         false,
			Branch:     ticket.Branch,
			HeadBranch: headBranch,
			TaskID:     ticket.TaskID,
			Reason:     reason,
		}, nil
	}
	return &PreflightResult{
		OK:         true,
		Branch:     ticket.Branch,
		HeadBranch: headBranch,
		TaskID:     ticket.TaskID,
		Reason:     "all required gates recorded",
	}, nil
}

// branchMismatchReason explains why a ticket cannot vouch for the current
// branch, or returns empty when it can.
//
// A ticket is tied to the branch it was opened on. One left over from earlier
// work would otherwise satisfy every later commit in the project, which is the
// exact failure that turned the gate into a formality. Outside a repository
// there is nothing to compare against, so the gates alone decide.
func branchMismatchReason(ticketBranch, headBranch string) string {
	if headBranch == "" {
		return ""
	}
	if ticketBranch == "" {
		return fmt.Sprintf("the ticket carries no branch but HEAD is %q — it predates this work; "+
			"start a new taskId with workflow_gate_record so a fresh ticket is opened for this branch", headBranch)
	}
	if ticketBranch != headBranch {
		return fmt.Sprintf("the ticket is for branch %q but HEAD is %q — record this branch's own gates "+
			"under a new taskId rather than reusing an earlier ticket", ticketBranch, headBranch)
	}
	return ""
}
