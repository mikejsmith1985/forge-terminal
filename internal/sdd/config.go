// config.go — named configuration constants for the SDD orchestrator, so timeouts,
// the notification endpoint, and the state directory are not magic literals (Article IV).
package sdd

import (
	"os"
	"path/filepath"
	"time"
)

const (
	// notifyURLEnvVar names the env var that overrides the AzureWorkflowPOC endpoint.
	notifyURLEnvVar = "FORGE_SDD_NOTIFY_URL"

	// defaultNotifyURL is the local AzureWorkflowPOC endpoint used when the env var is unset.
	defaultNotifyURL = "http://localhost:7000/sdd/phase"

	// notifyTimeout bounds each best-effort notification POST so a slow/down service
	// can never delay the decision card (FR-012).
	notifyTimeout = 5 * time.Second

	// stateDirName is the per-user subdirectory under ~/.forge that holds decision history.
	stateDirName = "sdd"
)

// notifyURL returns the configured AzureWorkflowPOC endpoint, preferring the env override.
func notifyURL() string {
	if override := os.Getenv(notifyURLEnvVar); override != "" {
		return override
	}
	return defaultNotifyURL
}

// stateDir returns the absolute path to the orchestrator's runtime state directory
// (~/.forge/sdd). Runtime audit data lives here, never in the committed specs/ tree.
func stateDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".forge", stateDirName), nil
}
