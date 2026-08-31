// Package workflow — brief.go: the change brief a developer must see before a commit lands.
//
// The problem this solves is not that changes go unexplained; it is that
// explanations go unread.  A wall of prose at the end of a task is agreed with
// rather than understood, so the loop becomes command, agree, test — and the
// developer never builds a picture of their own codebase.
//
// So a brief is a small set of short panels rather than a narrative, and it is
// a structured document rather than text.  Being structured is what makes it
// enforceable: an agent CLI is a full-screen program, so what reaches the
// terminal buffer is screen redraws rather than a transcript, and no reliable
// reading of prose is possible.  A published document, by contrast, is either
// present or absent — and absence is something a commit hook can refuse.
//
// The validation below is deliberately strict about emptiness.  A gate that an
// empty document satisfies is a formality, and a formality is exactly what
// already failed here once.
package workflow

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// The longest a single panel may be, in characters.
//
// A brief that grows without limit becomes the wall of text it replaces, so
// the cap is part of the contract rather than a style preference.  Generous
// enough for two or three sentences; short enough that nobody writes an essay.
const maximumPanelLength = 400

// The fewest characters a panel must carry to count as filled.
//
// Guards against a single character satisfying the non-empty check.  A panel
// shorter than this is not an answer, it is an evasion.
const minimumPanelLength = 10

// MaximumBriefPanels caps how much a brief may grow.
//
// A brief that expanded with the size of the change would become the wall of
// text it replaces. Past this point it has to summarise — which is the harder
// and more useful discipline anyway: naming the two decisions that mattered is
// worth more to a reader than listing twenty.
const MaximumBriefPanels = 6

// Errors a caller can distinguish, so the tool layer can name what was wrong
// rather than reporting a generic failure.
var (
	// ErrPanelEmpty means a required panel was missing or too short to be an answer.
	ErrPanelEmpty = errors.New("brief panel is empty")

	// ErrPanelTooLong means a panel exceeded the length that keeps a brief readable.
	ErrPanelTooLong = errors.New("brief panel is too long")

	// ErrDecisionsMissing means decisions were omitted without claiming the change was routine.
	ErrDecisionsMissing = errors.New("brief omits decisions without claiming the change was routine")

	// ErrAlternativeNotAlternative means the rejected option restates the chosen one.
	ErrAlternativeNotAlternative = errors.New("brief decision offers no real alternative")
)

// Decision is one fork in the change, and the reason one way was taken.
//
// This is the part that converts review into understanding.  A brief that only
// reports produces agreement; a brief that shows a fork produces a question,
// and a question is where a developer starts actually learning their codebase.
type Decision struct {
	// Chose is the path that was taken.
	Chose string `json:"chose"`

	// InsteadOf is the viable alternative that was not taken.
	InsteadOf string `json:"insteadOf"`

	// Because is the reason, in words a non-specialist would follow.
	Because string `json:"because"`

	// OpenQuestion is what the developer might reasonably push back on.
	// Every decision ends in something answerable rather than a closed statement.
	OpenQuestion string `json:"openQuestion"`
}

// ChangeBrief is what an agent publishes when a change is complete.
//
// Stored in a form that carries no assumptions about how it will be drawn, so
// a panel today and a browser page later can render the same document without
// agents having to publish it differently.
type ChangeBrief struct {
	// BriefID is stable across republishes, so a correction updates the brief
	// rather than leaving two versions on screen.
	BriefID string `json:"briefId"`

	// SessionID names the terminal session whose panel should show this.
	SessionID string `json:"sessionId"`

	// TaskID ties the brief to the ledger entry that gates the commit.
	TaskID string `json:"taskId"`

	// Headline is the change in one line, as a person would say it out loud.
	Headline string `json:"headline"`

	// WhatChanged is the change itself, in the fewest words that survive.
	WhatChanged string `json:"whatChanged"`

	// WhyItChanged is the reason.  A change with no stated reason has not been
	// understood by the person making it, let alone the person reading it.
	WhyItChanged string `json:"whyItChanged"`

	// WhatCouldBreak is the risk or assumption, carried as its own panel so it
	// is seen rather than buried in a clause.
	WhatCouldBreak string `json:"whatCouldBreak"`

	// Decisions are the forks that mattered.  May be empty only when the change
	// is claimed routine.
	Decisions []Decision `json:"decisions"`

	// IsRoutine claims that no real decision was made.  A truthful claim is
	// legitimate and cheap; making it explicit is what lets the developer see
	// and challenge it, which an omission would not.
	IsRoutine bool `json:"isRoutine"`

	// FilesTouched is a count, deliberately not a list: a brief names the
	// decisions that mattered, not every file the change happened to open.
	FilesTouched int `json:"filesTouched"`

	// PublishedAt orders briefs and shows staleness.
	PublishedAt time.Time `json:"publishedAt"`
}

// Validate reports whether a brief carries enough substance to be worth showing.
//
// Returns nil when the brief is publishable.  Otherwise returns an error naming
// the field at fault, so the agent can be told what to fix rather than being
// told only that something was wrong.
func (brief *ChangeBrief) Validate() error {
	panels := map[string]string{
		"headline":       brief.Headline,
		"whatChanged":    brief.WhatChanged,
		"whyItChanged":   brief.WhyItChanged,
		"whatCouldBreak": brief.WhatCouldBreak,
	}

	for fieldName, panelText := range panels {
		if err := validatePanel(fieldName, panelText); err != nil {
			return err
		}
	}

	// Decisions may be absent only when routineness is claimed outright.  The
	// agent has to say "there was no decision here" rather than leave a silence
	// the developer would read as "there was nothing to think about".
	if len(brief.Decisions) == 0 && !brief.IsRoutine {
		return fmt.Errorf("%w: set isRoutine when a change genuinely had no decision", ErrDecisionsMissing)
	}

	for index, decision := range brief.Decisions {
		if err := decision.validate(index); err != nil {
			return err
		}
	}

	return nil
}

// validatePanel checks one panel is neither an evasion nor an essay.
func validatePanel(fieldName, panelText string) error {
	trimmed := strings.TrimSpace(panelText)

	if len(trimmed) < minimumPanelLength {
		return fmt.Errorf("%w: %s", ErrPanelEmpty, fieldName)
	}
	if len(trimmed) > maximumPanelLength {
		return fmt.Errorf("%w: %s exceeds %d characters", ErrPanelTooLong, fieldName, maximumPanelLength)
	}
	return nil
}

// validate checks one decision names a genuine fork.
func (decision *Decision) validate(index int) error {
	fields := map[string]string{
		"chose":        decision.Chose,
		"insteadOf":    decision.InsteadOf,
		"because":      decision.Because,
		"openQuestion": decision.OpenQuestion,
	}

	for fieldName, fieldText := range fields {
		if strings.TrimSpace(fieldText) == "" {
			return fmt.Errorf("%w: decision %d %s", ErrPanelEmpty, index, fieldName)
		}
	}

	// A "decision" whose alternative restates the choice is not a decision at
	// all, and would let an agent satisfy the requirement without having
	// weighed anything.
	if equalIgnoringCaseAndSpace(decision.Chose, decision.InsteadOf) {
		return fmt.Errorf("%w: decision %d", ErrAlternativeNotAlternative, index)
	}

	return nil
}

// equalIgnoringCaseAndSpace compares two strings as a reader would hear them.
func equalIgnoringCaseAndSpace(first, second string) bool {
	return strings.EqualFold(strings.TrimSpace(first), strings.TrimSpace(second))
}

// PanelCount reports how many panels this brief renders as.
//
// A routine change is one panel. Anything else is the three standing panels
// plus one per decision, capped so a large change summarises rather than
// sprawling.
func (brief *ChangeBrief) PanelCount() int {
	if brief.IsRoutine && len(brief.Decisions) == 0 {
		return 1
	}

	// What changed, why, and what could break — the three that always appear.
	const standingPanels = 3

	total := standingPanels + len(brief.Decisions)
	if total > MaximumBriefPanels {
		return MaximumBriefPanels
	}
	return total
}

// DecisionsToShow returns the decisions a brief should render.
//
// Capped for the same reason as PanelCount: past a handful, a reader stops
// reading them individually and starts skimming, which defeats the point.
func (brief *ChangeBrief) DecisionsToShow() []Decision {
	const standingPanels = 3
	room := MaximumBriefPanels - standingPanels

	if len(brief.Decisions) <= room {
		return brief.Decisions
	}
	return brief.Decisions[:room]
}
