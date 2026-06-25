// sdd_binding_store.go — the durable session→worktree recovery store (specs/013 US2).
// It records which isolated worktree a tab/session belongs to so a reopened tab re-attaches
// to its exact directory across an app restart, when the in-memory pipeline map is empty.
// One small JSON file under ~/.forge/sdd makes recovery server-authoritative rather than
// dependent on the frontend re-reporting the worktree's working directory.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// worktreeBindingFile is the recovery store's filename under the SDD state directory.
const worktreeBindingFile = "worktree-bindings.json"

// worktreeBindingRecord is one session's durable association with an isolated worktree.
type worktreeBindingRecord struct {
	WorktreePath string `json:"worktreePath"`
	Branch       string `json:"branch"`
	BaseBranch   string `json:"baseBranch"`
	MainRepoRoot string `json:"mainRepoRoot"`
}

// worktreeBindingMu serializes reads and writes of the on-disk store so concurrent
// binds and cleanups never corrupt the file.
var worktreeBindingMu sync.Mutex

// worktreeBindingStoreDir resolves the directory holding the recovery store. It is a var so
// tests can redirect it away from the real ~/.forge/sdd; production uses sddStateDir.
var worktreeBindingStoreDir = sddStateDir

// worktreeBindingPath returns the absolute path of the recovery store file.
func worktreeBindingPath() string {
	return filepath.Join(worktreeBindingStoreDir(), worktreeBindingFile)
}

// loadWorktreeBindings reads every record. A missing OR corrupt file loads as an empty map —
// fail-safe to recovery (no record → normal resolution), never to provisioning (specs/013).
func loadWorktreeBindings() map[string]worktreeBindingRecord {
	records := map[string]worktreeBindingRecord{}
	data, err := os.ReadFile(worktreeBindingPath())
	if err != nil {
		return records
	}
	_ = json.Unmarshal(data, &records) // corrupt content → empty map, never surfaced as an error.
	return records
}

// lookupWorktreeBinding returns the durable record for a session, if one exists.
func lookupWorktreeBinding(sessionID string) (worktreeBindingRecord, bool) {
	worktreeBindingMu.Lock()
	defer worktreeBindingMu.Unlock()
	record, ok := loadWorktreeBindings()[sessionID]
	return record, ok
}

// saveWorktreeBinding records (or replaces) a session's worktree association.
func saveWorktreeBinding(sessionID string, record worktreeBindingRecord) {
	worktreeBindingMu.Lock()
	defer worktreeBindingMu.Unlock()
	records := loadWorktreeBindings()
	records[sessionID] = record
	persistWorktreeBindings(records)
}

// evictWorktreeBinding removes a session's record once its worktree is gone or reclaimed.
func evictWorktreeBinding(sessionID string) {
	worktreeBindingMu.Lock()
	defer worktreeBindingMu.Unlock()
	records := loadWorktreeBindings()
	if _, ok := records[sessionID]; !ok {
		return
	}
	delete(records, sessionID)
	persistWorktreeBindings(records)
}

// persistWorktreeBindings writes the store, creating the state directory if needed. Best-effort:
// a write failure leaves recovery to the in-memory map rather than blocking a bind.
func persistWorktreeBindings(records map[string]worktreeBindingRecord) {
	if err := os.MkdirAll(worktreeBindingStoreDir(), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(worktreeBindingPath(), data, 0o644)
}
