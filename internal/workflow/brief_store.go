// Package workflow — brief_store.go: where published change briefs are kept.
//
// Briefs sit beside the gate ledger under .forge/, so a single gitignored
// directory holds the whole of the workflow's local state and the pre-commit
// hook has one place to look.
//
// One brief is one file, named by its identity.  That choice is what makes
// republishing replace rather than accumulate: an agent correcting a brief
// overwrites the file it wrote before, and the developer is never asked to work
// out which of two versions on screen is the current one.  Reconciling versions
// is reading work, and removing reading work is the point of the feature.
package workflow

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// BriefDirName is the directory under .forge/ that holds published briefs.
const BriefDirName = "briefs"

// briefFileMode and briefDirMode match the permissions the ticket already uses,
// so the two halves of the workflow's state do not differ for no reason.
const (
	briefFileMode = 0o644
	briefDirMode  = 0o755
)

// briefDirectory returns the directory holding briefs for one project.
func briefDirectory(projectRoot string) string {
	return filepath.Join(projectRoot, TicketDir, BriefDirName)
}

// briefPath returns the file one brief is stored at.
func briefPath(projectRoot, briefID string) string {
	return filepath.Join(briefDirectory(projectRoot), briefID+".json")
}

// SaveBrief validates a brief and writes it, replacing any earlier version.
//
// Validation happens here rather than only at the tool boundary, because a
// brief that reached disk unvalidated could satisfy the commit gate while
// teaching the developer nothing — and the gate would then be a formality.
//
// Stamps PublishedAt when the caller has not, so staleness is always visible.
func SaveBrief(projectRoot string, brief *ChangeBrief) error {
	if err := brief.Validate(); err != nil {
		return fmt.Errorf("refusing to store an invalid brief: %w", err)
	}
	if strings.TrimSpace(brief.BriefID) == "" {
		return fmt.Errorf("refusing to store a brief with no identity")
	}
	if brief.PublishedAt.IsZero() {
		brief.PublishedAt = time.Now().UTC()
	}

	if err := os.MkdirAll(briefDirectory(projectRoot), briefDirMode); err != nil {
		return fmt.Errorf("creating the brief directory: %w", err)
	}

	encoded, err := json.MarshalIndent(brief, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding the brief: %w", err)
	}

	if err := os.WriteFile(briefPath(projectRoot, brief.BriefID), encoded, briefFileMode); err != nil {
		return fmt.Errorf("writing the brief: %w", err)
	}
	return nil
}

// LoadBrief reads one published brief by its identity.
func LoadBrief(projectRoot, briefID string) (*ChangeBrief, error) {
	contents, err := os.ReadFile(briefPath(projectRoot, briefID))
	if err != nil {
		return nil, fmt.Errorf("reading brief %q: %w", briefID, err)
	}

	var brief ChangeBrief
	if err := json.Unmarshal(contents, &brief); err != nil {
		return nil, fmt.Errorf("decoding brief %q: %w", briefID, err)
	}
	return &brief, nil
}

// ListBriefs returns every published brief for a project, newest first.
//
// Ordering is by publication time rather than filename, because the developer
// cares which brief is current and a brief identity carries no chronology.
func ListBriefs(projectRoot string) ([]ChangeBrief, error) {
	entries, err := os.ReadDir(briefDirectory(projectRoot))
	if err != nil {
		// A project that has published nothing is not an error; it is a project
		// at the start of its first change.
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("reading the brief directory: %w", err)
	}

	briefs := make([]ChangeBrief, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}

		briefID := strings.TrimSuffix(entry.Name(), ".json")
		brief, err := LoadBrief(projectRoot, briefID)
		if err != nil {
			// One unreadable file must not hide every other brief from the
			// developer, so it is skipped rather than fatal.
			continue
		}
		briefs = append(briefs, *brief)
	}

	sort.Slice(briefs, func(earlier, later int) bool {
		return briefs[earlier].PublishedAt.After(briefs[later].PublishedAt)
	})
	return briefs, nil
}

// HasBriefForTask reports whether any brief was published against a task.
//
// This is what the commit gate asks.  It deliberately tests for presence rather
// than judging content: content was already judged at publication, and a gate
// that re-litigated quality would be making a call only the developer can make.
func HasBriefForTask(projectRoot, taskID string) bool {
	briefs, err := ListBriefs(projectRoot)
	if err != nil {
		return false
	}
	for _, brief := range briefs {
		if brief.TaskID == taskID {
			return true
		}
	}
	return false
}
