// Package workflow — brief_test.go: the rules that stop a change brief being a formality.
//
// The gate this feeds refuses a commit that published no brief.  That is only
// worth anything if a brief has to say something: if an empty document passed,
// an agent could satisfy the gate without the developer learning a thing, and
// the mechanism would decay into the advisory rule it replaced.
//
// So most of what follows tests rejection rather than acceptance.  The one
// acceptance case that matters is the honest one — a change really can be
// routine, and saying so out loud is allowed.
package workflow

import (
	"errors"
	"strings"
	"testing"
)

// validBrief returns a brief that should pass, so each test can spoil exactly
// one thing and prove that one thing is what was caught.
func validBrief() ChangeBrief {
	return ChangeBrief{
		BriefID:        "brief-001",
		SessionID:      "session-001",
		TaskID:         "task-001",
		Headline:       "Folders now give up their path on a right-click",
		WhatChanged:    "Right-clicking a folder offers Copy Path in both the file tree and the projects browser.",
		WhyItChanged:   "Copy Path existed on files only, so a folder's path could not be got out of the interface at all.",
		WhatCouldBreak: "The clipboard is unavailable outside a secure context, so the copy reports failure rather than failing silently.",
		Decisions: []Decision{{
			Chose:        "One shared context menu used by both surfaces",
			InsteadOf:    "A separate menu implementation for each surface",
			Because:      "Two menus drift apart in dismissal and positioning, which is the bug being fixed.",
			OpenQuestion: "Is the shared menu worth the coupling between two unrelated panels?",
		}},
		IsRoutine:    false,
		FilesTouched: 6,
	}
}

func TestValidBriefIsAccepted(t *testing.T) {
	brief := validBrief()

	if err := brief.Validate(); err != nil {
		t.Fatalf("a complete brief should validate, got: %v", err)
	}
}

func TestEmptyPanelIsRejected(t *testing.T) {
	// Each required panel is spoiled in turn, because a validator that checks
	// only the first field would otherwise pass this test.
	cases := map[string]func(*ChangeBrief){
		"headline":       func(brief *ChangeBrief) { brief.Headline = "" },
		"whatChanged":    func(brief *ChangeBrief) { brief.WhatChanged = "" },
		"whyItChanged":   func(brief *ChangeBrief) { brief.WhyItChanged = "" },
		"whatCouldBreak": func(brief *ChangeBrief) { brief.WhatCouldBreak = "" },
	}

	for fieldName, spoil := range cases {
		t.Run(fieldName, func(t *testing.T) {
			brief := validBrief()
			spoil(&brief)

			err := brief.Validate()

			if !errors.Is(err, ErrPanelEmpty) {
				t.Fatalf("an empty %s should be rejected, got: %v", fieldName, err)
			}
			// The agent has to be told which field to fix, not merely that
			// something was wrong.
			if !strings.Contains(err.Error(), fieldName) {
				t.Errorf("the error should name %s, got: %v", fieldName, err)
			}
		})
	}
}

func TestWhitespaceOnlyPanelIsRejected(t *testing.T) {
	// Spaces are the obvious way to defeat a naive non-empty check.
	brief := validBrief()
	brief.WhatCouldBreak = "        "

	if err := brief.Validate(); !errors.Is(err, ErrPanelEmpty) {
		t.Fatalf("a whitespace-only panel should be rejected, got: %v", err)
	}
}

func TestOverlongPanelIsRejected(t *testing.T) {
	// A brief with no upper bound becomes the wall of text it exists to replace.
	brief := validBrief()
	brief.WhatChanged = strings.Repeat("a", maximumPanelLength+1)

	if err := brief.Validate(); !errors.Is(err, ErrPanelTooLong) {
		t.Fatalf("an overlong panel should be rejected, got: %v", err)
	}
}

func TestMissingDecisionsRequireAnExplicitRoutineClaim(t *testing.T) {
	brief := validBrief()
	brief.Decisions = nil
	brief.IsRoutine = false

	if err := brief.Validate(); !errors.Is(err, ErrDecisionsMissing) {
		t.Fatalf("omitting decisions without claiming routineness should be rejected, got: %v", err)
	}
}

func TestRoutineChangeMayCarryNoDecisions(t *testing.T) {
	// The honest case.  A mechanical change really does have no fork in it, and
	// forcing one to be invented would teach the developer nothing and train
	// the agent to manufacture significance.
	brief := validBrief()
	brief.Decisions = nil
	brief.IsRoutine = true

	if err := brief.Validate(); err != nil {
		t.Fatalf("a change claimed routine may carry no decisions, got: %v", err)
	}
}

func TestDecisionWithoutARealAlternativeIsRejected(t *testing.T) {
	// Restating the choice as its own alternative would let an agent satisfy
	// the requirement without having weighed anything.
	brief := validBrief()
	brief.Decisions[0].InsteadOf = brief.Decisions[0].Chose

	if err := brief.Validate(); !errors.Is(err, ErrAlternativeNotAlternative) {
		t.Fatalf("a decision whose alternative restates the choice should be rejected, got: %v", err)
	}
}

func TestDecisionAlternativeComparisonIgnoresCaseAndSpacing(t *testing.T) {
	brief := validBrief()
	brief.Decisions[0].InsteadOf = "  " + strings.ToUpper(brief.Decisions[0].Chose) + "  "

	if err := brief.Validate(); !errors.Is(err, ErrAlternativeNotAlternative) {
		t.Fatalf("case and spacing should not disguise a non-alternative, got: %v", err)
	}
}

func TestEveryDecisionFieldIsRequired(t *testing.T) {
	cases := map[string]func(*Decision){
		"chose":        func(decision *Decision) { decision.Chose = "" },
		"insteadOf":    func(decision *Decision) { decision.InsteadOf = "" },
		"because":      func(decision *Decision) { decision.Because = "" },
		"openQuestion": func(decision *Decision) { decision.OpenQuestion = "" },
	}

	for fieldName, spoil := range cases {
		t.Run(fieldName, func(t *testing.T) {
			brief := validBrief()
			spoil(&brief.Decisions[0])

			if err := brief.Validate(); !errors.Is(err, ErrPanelEmpty) {
				t.Fatalf("an empty decision %s should be rejected, got: %v", fieldName, err)
			}
		})
	}
}

func TestOpenQuestionIsRequiredSoADecisionEndsAnswerably(t *testing.T) {
	// The open question is the whole mechanism by which a brief provokes a
	// question rather than a nod, so its absence is a validation failure and
	// not a stylistic shortfall.
	brief := validBrief()
	brief.Decisions[0].OpenQuestion = "   "

	if err := brief.Validate(); !errors.Is(err, ErrPanelEmpty) {
		t.Fatalf("a decision with no open question should be rejected, got: %v", err)
	}
}
