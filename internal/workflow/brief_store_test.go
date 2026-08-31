// Package workflow — brief_store_test.go: how briefs survive on disk.
//
// Two properties matter here, and only one is obvious.  The obvious one is
// that a brief written can be read back.  The other is that republishing under
// the same identity replaces rather than accumulates: an agent correcting a
// brief must not leave two versions on screen for the developer to reconcile,
// because reconciling them is exactly the reading work this feature exists to
// remove.
package workflow

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBriefRoundTripsThroughDisk(t *testing.T) {
	projectRoot := t.TempDir()
	brief := validBrief()

	if err := SaveBrief(projectRoot, &brief); err != nil {
		t.Fatalf("saving a valid brief should succeed, got: %v", err)
	}

	loaded, err := LoadBrief(projectRoot, brief.BriefID)
	if err != nil {
		t.Fatalf("loading a saved brief should succeed, got: %v", err)
	}

	if loaded.Headline != brief.Headline {
		t.Errorf("headline did not survive: want %q, got %q", brief.Headline, loaded.Headline)
	}
	if len(loaded.Decisions) != len(brief.Decisions) {
		t.Fatalf("decisions did not survive: want %d, got %d", len(brief.Decisions), len(loaded.Decisions))
	}
	if loaded.Decisions[0].OpenQuestion != brief.Decisions[0].OpenQuestion {
		t.Errorf("the open question did not survive, which is the part that provokes a question")
	}
}

func TestSavingStampsThePublishedTime(t *testing.T) {
	projectRoot := t.TempDir()
	brief := validBrief()
	brief.PublishedAt = brief.PublishedAt.UTC()

	if err := SaveBrief(projectRoot, &brief); err != nil {
		t.Fatalf("saving should succeed, got: %v", err)
	}

	if brief.PublishedAt.IsZero() {
		t.Error("saving should stamp the publication time, so staleness is visible")
	}
}

func TestRepublishingUnderTheSameIdentityReplaces(t *testing.T) {
	projectRoot := t.TempDir()

	first := validBrief()
	if err := SaveBrief(projectRoot, &first); err != nil {
		t.Fatalf("first save should succeed, got: %v", err)
	}

	corrected := validBrief()
	corrected.Headline = "Corrected: folders give up their path on a right-click"
	if err := SaveBrief(projectRoot, &corrected); err != nil {
		t.Fatalf("republishing should succeed, got: %v", err)
	}

	loaded, err := LoadBrief(projectRoot, first.BriefID)
	if err != nil {
		t.Fatalf("loading after republish should succeed, got: %v", err)
	}
	if loaded.Headline != corrected.Headline {
		t.Errorf("republish should replace: want %q, got %q", corrected.Headline, loaded.Headline)
	}

	briefs, err := ListBriefs(projectRoot)
	if err != nil {
		t.Fatalf("listing should succeed, got: %v", err)
	}
	if len(briefs) != 1 {
		t.Errorf("republishing must not accumulate versions: want 1 brief, got %d", len(briefs))
	}
}

func TestDistinctBriefsAccumulate(t *testing.T) {
	projectRoot := t.TempDir()

	first := validBrief()
	second := validBrief()
	second.BriefID = "brief-002"

	if err := SaveBrief(projectRoot, &first); err != nil {
		t.Fatalf("first save should succeed, got: %v", err)
	}
	if err := SaveBrief(projectRoot, &second); err != nil {
		t.Fatalf("second save should succeed, got: %v", err)
	}

	briefs, err := ListBriefs(projectRoot)
	if err != nil {
		t.Fatalf("listing should succeed, got: %v", err)
	}
	if len(briefs) != 2 {
		t.Errorf("two distinct briefs should both survive: want 2, got %d", len(briefs))
	}
}

func TestAnInvalidBriefIsNeverStored(t *testing.T) {
	// Storing an invalid brief would let the gate be satisfied by a document
	// nobody could learn anything from, which is the failure the whole design
	// is built to avoid.
	projectRoot := t.TempDir()
	brief := validBrief()
	brief.WhatCouldBreak = ""

	if err := SaveBrief(projectRoot, &brief); err == nil {
		t.Fatal("saving an invalid brief should fail")
	}

	briefs, _ := ListBriefs(projectRoot)
	if len(briefs) != 0 {
		t.Errorf("a rejected brief must leave nothing behind, got %d stored", len(briefs))
	}
}

func TestLoadingAnAbsentBriefReportsItPlainly(t *testing.T) {
	projectRoot := t.TempDir()

	if _, err := LoadBrief(projectRoot, "no-such-brief"); err == nil {
		t.Fatal("loading a brief that was never published should fail")
	}
}

func TestBriefsLiveUnderTheForgeDirectory(t *testing.T) {
	// The ticket already lives under .forge/, and the pre-commit hook reads it
	// from there.  Briefs sit beside it so one gitignored directory holds the
	// whole of the workflow's local state.
	projectRoot := t.TempDir()
	brief := validBrief()

	if err := SaveBrief(projectRoot, &brief); err != nil {
		t.Fatalf("saving should succeed, got: %v", err)
	}

	briefDirectory := filepath.Join(projectRoot, TicketDir, BriefDirName)
	if _, err := os.Stat(briefDirectory); err != nil {
		t.Errorf("briefs should live under %s, got: %v", briefDirectory, err)
	}
}
