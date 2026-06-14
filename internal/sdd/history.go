// history.go — append-only decision history so the pipeline's review trail is auditable
// (FR-015). Stored under ~/.forge/sdd/<feature>.json, outside the committed specs/ tree.
package sdd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

// HistoryRecord is one persisted decision.
type HistoryRecord struct {
	Phase       PhaseName `json:"phase"`
	Action      Action    `json:"action"`
	ClarifyText string    `json:"clarifyText,omitempty"`
	Timestamp   string    `json:"timestamp"`
}

// appendDecision appends a decision to baseDir/<feature>.json, creating the file and
// directory if needed. baseDir is a parameter (not hard-coded ~/.forge/sdd) so tests can
// point it at a temp directory and run fully mocked.
func appendDecision(baseDir, feature string, decision Decision) error {
	records, err := loadHistory(baseDir, feature)
	if err != nil {
		return err
	}

	records = append(records, HistoryRecord{
		Phase:       decision.Phase,
		Action:      decision.Action,
		ClarifyText: decision.ClarifyText,
		Timestamp:   decision.Timestamp.UTC().Format(time.RFC3339),
	})

	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return err
	}
	encoded, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(historyPath(baseDir, feature), encoded, 0o644)
}

// loadHistory reads the decision records for a feature, returning an empty slice when
// no history file exists yet (a first decision is not an error).
func loadHistory(baseDir, feature string) ([]HistoryRecord, error) {
	raw, err := os.ReadFile(historyPath(baseDir, feature))
	if os.IsNotExist(err) {
		return []HistoryRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	var records []HistoryRecord
	if err := json.Unmarshal(raw, &records); err != nil {
		return nil, err
	}
	return records, nil
}

// historyPath builds the per-feature history file path.
func historyPath(baseDir, feature string) string {
	return filepath.Join(baseDir, feature+".json")
}
