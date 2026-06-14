// sdd_wiring.go — wires the SDD orchestrator (internal/sdd) to live Forge subsystems:
// the macro-injection path (advance), the WebSocket hub (card push), and the tutor file
// watcher (detect). Binding is frontend-driven (POST /api/sdd/bind) because the backend
// does not track a per-session working directory; the frontend, which knows the active
// session and its repo, tells us which session runs the pipeline and where.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
	"github.com/mikejsmith1985/forge-terminal/internal/tutor"
)

// sddWatcher is the active feature-directory watcher, replaced on each bind.
var sddWatcher *tutor.Watcher

// PTY-quiet detection tuning for artifact-less phases (Validate/Implement). These are
// heuristics: "the terminal was silent for sddPhaseQuietMs" stands in for "the phase command
// finished," which is reliable for a quick analyze but only best-effort for a long Implement.
const (
	sddPhaseFloorMs = 4000           // let the injected command start before watching for quiet
	sddPhaseQuietMs = 8000           // 8s of terminal silence => the phase command finished
	sddPhaseMaxMs   = 30 * 60 * 1000 // 30-minute safety cap (Implement can run long)
)

// sddGateEnvelope is the on-the-wire SDD_PHASE_GATE message. Embedding DecisionCard flattens
// its fields (cardId, sessionId, phase, summary, actions) alongside the type discriminator.
type sddGateEnvelope struct {
	Type string `json:"type"`
	sdd.DecisionCard
}

// sddBindRequest binds a terminal session and its repository to the pipeline.
type sddBindRequest struct {
	SessionID string `json:"sessionId"`
	RepoRoot  string `json:"repoRoot"`
}

// handleSddBind starts (or restarts) the orchestrator for a session + repo. It resolves the
// active feature directory from the repo's .specify/feature.json and begins watching for
// phase artifacts.
func handleSddBind(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeSddError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var request sddBindRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeSddError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if request.SessionID == "" || request.RepoRoot == "" {
		writeSddError(w, http.StatusBadRequest, "sessionId and repoRoot are required")
		return
	}

	featureDir, ok := resolveSddFeatureDir(request.RepoRoot)
	if !ok {
		writeSddError(w, http.StatusConflict, "no active feature (.specify/feature.json not found)")
		return
	}

	startSddPipeline(request.SessionID, request.RepoRoot, featureDir)
	writeSddJSON(w, http.StatusOK, map[string]string{"status": "bound", "feature": filepath.Base(featureDir)})
}

// resolveSddFeatureDir reads the active feature directory from repoRoot/.specify/feature.json.
func resolveSddFeatureDir(repoRoot string) (string, bool) {
	raw, err := os.ReadFile(filepath.Join(repoRoot, ".specify", "feature.json"))
	if err != nil {
		return "", false
	}
	var meta struct {
		FeatureDirectory string `json:"feature_directory"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil || meta.FeatureDirectory == "" {
		return "", false
	}
	return filepath.Join(repoRoot, filepath.FromSlash(meta.FeatureDirectory)), true
}

// startSddPipeline constructs the orchestrator with live ports and starts the watcher loop.
func startSddPipeline(sessionID, repoRoot, featureDir string) {
	if sddWatcher != nil {
		sddWatcher.Stop()
		sddWatcher = nil
	}

	feature := filepath.Base(featureDir)
	sddOrchestrator = sdd.NewOrchestrator(sdd.Options{
		Feature:        feature,
		FeatureDir:     featureDir,
		SessionID:      sessionID,
		HistoryBaseDir: sddStateDir(),
		Injector:       newSddInjector(),
		Broadcaster:    newSddBroadcaster(),
		Waiter:         newSddWaiter(),
	})

	// US3 (FR-011/012): subscribe a best-effort notifier to the shared completion seam.
	// It is independent of the card subscriber (US1) — both observe the same event.
	notifier := sdd.NewNotifier()
	sddOrchestrator.Subscribe(func(phase sdd.PhaseName, artifactPath string) {
		notifier.Notify(feature, phase, artifactPath)
	})

	watcher := tutor.NewWatcher(repoRoot, "sdd")
	if err := watcher.Start(); err != nil {
		log.Printf("[sdd] failed to start watcher on %s: %v", repoRoot, err)
		return
	}
	sddWatcher = watcher
	go runSddDetector(watcher, repoRoot, featureDir, sessionID)
	log.Printf("[sdd] pipeline bound: session=%s feature=%s", sessionID, filepath.Base(featureDir))
}

// runSddDetector consumes watcher notifications and gates each recognized phase artifact.
func runSddDetector(watcher *tutor.Watcher, repoRoot, featureDir, sessionID string) {
	for notification := range watcher.Notifications() {
		for _, change := range notification.Files {
			gateSddArtifact(change.Path, repoRoot, featureDir, sessionID)
		}
	}
}

// gateSddArtifact classifies one changed file and, if it is a phase artifact, fires the
// shared completion seam. Files outside the feature directory or unrecognized are ignored.
func gateSddArtifact(changedPath, repoRoot, featureDir, sessionID string) {
	featureRel, ok := sddFeatureRel(changedPath, repoRoot, featureDir)
	if !ok {
		return
	}
	content, err := os.ReadFile(filepath.Join(featureDir, filepath.FromSlash(featureRel)))
	if err != nil {
		return
	}
	phase, recognized := sdd.DetectCompletedPhase(featureRel, string(content))
	if !recognized || sddOrchestrator == nil {
		return
	}
	sddOrchestrator.BindSession(sessionID)
	sddOrchestrator.HandlePhaseComplete(phase, featureRel)
}

// sddFeatureRel returns the path of a changed file relative to the feature directory,
// handling both absolute and repo-relative watcher paths. It returns false when the file
// lies outside the feature directory.
func sddFeatureRel(changedPath, repoRoot, featureDir string) (string, bool) {
	absolute := changedPath
	if !filepath.IsAbs(absolute) {
		absolute = filepath.Join(repoRoot, changedPath)
	}
	relative, err := filepath.Rel(featureDir, absolute)
	if err != nil {
		return "", false
	}
	relative = filepath.ToSlash(relative)
	if relative == ".." || strings.HasPrefix(relative, "../") {
		return "", false
	}
	return relative, true
}

// newSddInjector advances the pipeline by injecting the next command, reusing the macro
// path's quiet-detection. It returns immediately and injects on a goroutine so the decision
// HTTP request is never blocked by the (potentially multi-second) PTY-quiet wait.
func newSddInjector() sdd.CommandInjector {
	return sdd.InjectorFunc(func(sessionID, text string) error {
		go injectSddCommand(sessionID, text)
		return nil
	})
}

// injectSddCommand performs the actual macro injection, mirroring handleMacro's core flow.
func injectSddCommand(sessionID, text string) {
	if termHandler == nil {
		return
	}
	session, found := termHandler.GetSession(sessionID)
	if !found {
		log.Printf("[sdd] inject: session %s not found", sessionID)
		return
	}
	startedAt := time.Now()
	time.Sleep(time.Duration(defaultMacroMinDelayMs) * time.Millisecond)
	waitForPTYQuiet(session, defaultMacroQuietMs, defaultMacroMaxDelayMs, startedAt, startedAt)
	mode := pickMacroMode(session, "")
	if _, err := writeMacro(session, text, mode); err != nil {
		log.Printf("[sdd] inject failed for session %s: %v", sessionID, err)
	}
}

// newSddWaiter detects completion of an artifact-less phase (Validate/Implement) by waiting
// for the terminal to go quiet after the phase's command was injected — reusing the macro
// subsystem's quiet-detection. The floor delay lets the command begin so an idle prompt right
// after the decision is not mistaken for completion.
func newSddWaiter() sdd.CompletionWaiter {
	return sdd.WaiterFunc(func(sessionID string, phase sdd.PhaseName) {
		if termHandler == nil {
			return
		}
		session, found := termHandler.GetSession(sessionID)
		if !found {
			return
		}
		startedAt := time.Now()
		time.Sleep(time.Duration(sddPhaseFloorMs) * time.Millisecond)
		waitForPTYQuiet(session, sddPhaseQuietMs, sddPhaseMaxMs, startedAt, time.Now())
		log.Printf("[sdd] pty-quiet detected for phase %s (session %s)", phase, sessionID)
	})
}

// newSddBroadcaster pushes the decision card to the session's WebSocket clients as an
// SDD_PHASE_GATE message over the existing hub.
func newSddBroadcaster() sdd.GateBroadcaster {
	return sdd.BroadcasterFunc(func(card sdd.DecisionCard) error {
		if termHandler == nil {
			return nil
		}
		termHandler.BroadcastJSONToSession(card.SessionID, sddGateEnvelope{Type: "SDD_PHASE_GATE", DecisionCard: card})
		return nil
	})
}

// sddStateDir returns ~/.forge/sdd, where decision history is persisted.
func sddStateDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".forge", "sdd")
	}
	return filepath.Join(home, ".forge", "sdd")
}
