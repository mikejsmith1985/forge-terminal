// sdd_wiring.go — wires the SDD orchestrator (internal/sdd) to live Forge subsystems:
// the macro-injection path (advance), the WebSocket hub (card push), and the tutor file
// watcher (detect).
//
// Binding model (per-session, eager): each terminal session gets its OWN pipeline (orchestrator
// + watcher), keyed by sessionId, so multiple sessions gate independently instead of clobbering a
// single global. Binding is EAGER — a session is bound to its repo as soon as the frontend knows
// the working directory, WITHOUT requiring .specify/feature.json to exist yet. The watcher then
// LAZILY learns the active feature the moment a phase artifact (specs/<feature>/spec.md, plan.md…)
// is written — which is exactly when the developer runs /speckit-specify. This fixes the original
// failure where binding happened once, 409'd because no feature existed yet, and never retried.
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
	"github.com/mikejsmith1985/forge-terminal/internal/tutor"
)

// PTY-quiet detection tuning for artifact-less phases (Validate/Implement). These are
// heuristics: "the terminal was silent for sddPhaseQuietMs" stands in for "the phase command
// finished," which is reliable for a quick analyze but only best-effort for a long Implement.
const (
	sddPhaseFloorMs     = 4000           // let the injected command start before watching for quiet
	sddPhaseQuietMs     = 8000           // 8s of terminal silence => the phase command finished
	sddPhaseMaxMs       = 30 * 60 * 1000 // 30-minute safety cap (Implement can run long)
	sddArtifactMaxLines = 200            // line cap for artifact preview embedded in SDD_PHASE_GATE
)

// sddArtifactPreview carries the embedded artifact preview sent inside SDD_PHASE_GATE.
// Content is empty (not nil) when the file could not be read, allowing callers to use
// `preview.Content != ""` as a readiness check without a nil dereference.
type sddArtifactPreview struct {
	Content     string `json:"content"`
	FilePath    string `json:"filePath"`
	TotalLines  int    `json:"totalLines"`
	IsTruncated bool   `json:"isTruncated"`
}

// readSddArtifactPreview reads absPath and returns the first maxLines lines as a preview.
// Returns a zero-value preview (Content:"") on any read error so the gate envelope
// is always safe to marshal even when the artifact file is missing or unreadable.
func readSddArtifactPreview(absPath string, maxLines int) sddArtifactPreview {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return sddArtifactPreview{FilePath: absPath}
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	total := len(lines)
	isTruncated := total > maxLines
	if isTruncated {
		lines = lines[:maxLines]
	}
	return sddArtifactPreview{
		Content:     strings.Join(lines, "\n"),
		FilePath:    absPath,
		TotalLines:  total,
		IsTruncated: isTruncated,
	}
}

// sddPipeline is one session's bound pipeline: its orchestrator, the repo watcher feeding it,
// and the repo root it watches. One per terminal session.
type sddPipeline struct {
	orchestrator *sdd.Orchestrator
	watcher      *tutor.Watcher
	repoRoot     string
	// decisions holds the command-emitted decisions per phase (sdd.PhaseName -> []string),
	// carried by the authoritative phase-event so the US3 report card can show them (FR-007a).
	decisions sync.Map
	// baselines holds the git work-tree snapshot (SHA) captured at each phase's start
	// (sdd.PhaseName -> string), so the report card can diff the phase window (FR-014).
	baselines sync.Map
	// Worktree binding (specs/011). gitCommonDir is the per-repo grouping key used to detect
	// concurrency; when isIsolated, the pipeline runs in worktreePath on its own branch instead
	// of the repository's main checkout, so repoRoot above already points at the worktree.
	gitCommonDir string
	mainRepoRoot string
	worktreePath string
	branch       string
	baseBranch   string
	isIsolated   bool
}

// storeDecisions records the command-emitted decisions for a phase (FR-007a).
func (p *sddPipeline) storeDecisions(phase sdd.PhaseName, decisions []string) {
	p.decisions.Store(phase, decisions)
}

// decisionsFor returns the command-emitted decisions for a phase, or nil if none were emitted.
func (p *sddPipeline) decisionsFor(phase sdd.PhaseName) []string {
	if value, ok := p.decisions.Load(phase); ok {
		return value.([]string)
	}
	return nil
}

// storeBaseline records the git work-tree snapshot taken when a phase started (FR-014).
func (p *sddPipeline) storeBaseline(phase sdd.PhaseName, treeSHA string) {
	p.baselines.Store(phase, treeSHA)
}

// baselineFor returns the phase-start work-tree snapshot, or "" if none was captured.
func (p *sddPipeline) baselineFor(phase sdd.PhaseName) string {
	if value, ok := p.baselines.Load(phase); ok {
		return value.(string)
	}
	return ""
}

// sddPipelines maps sessionId -> *sddPipeline. A sync.Map because binds (HTTP), decisions (HTTP),
// and the watcher goroutines all touch it concurrently.
var sddPipelines sync.Map

// sddPipelineFor returns the bound pipeline for a session, if any.
func sddPipelineFor(sessionID string) (*sddPipeline, bool) {
	value, ok := sddPipelines.Load(sessionID)
	if !ok {
		return nil, false
	}
	return value.(*sddPipeline), true
}

// sddGateEnvelope is the on-the-wire SDD_PHASE_GATE message. Embedding DecisionCard flattens
// its fields (cardId, sessionId, phase, summary, actions) alongside the type discriminator.
// ArtifactPreview carries the first sddArtifactMaxLines lines of the phase artifact for
// file-detected phases; it is omitted (omitempty) for pty-quiet phases (Validate/Implement).
type sddGateEnvelope struct {
	Type            string              `json:"type"`
	ArtifactPreview *sddArtifactPreview `json:"artifactPreview,omitempty"`
	ReportCard      *sddPhaseReportCard `json:"reportCard,omitempty"`
	sdd.DecisionCard
}

// sddBindRequest binds a terminal session and its repository to the pipeline.
type sddBindRequest struct {
	SessionID string `json:"sessionId"`
	RepoRoot  string `json:"repoRoot"`
}

// handleSddBind binds (eagerly) a terminal session to its repository so the orchestrator watches
// for phase artifacts. It does NOT require a feature to exist yet — the feature is learned lazily
// when the first artifact appears. Binding the same session to the same repo again is a no-op, so
// routine re-binds (e.g. tab switches) never tear down a pipeline or invalidate an on-screen card.
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

	// Idempotent: an already-isolated session stays put (the frontend may briefly still report the
	// pre-cd path), and a re-bind to the same repo leaves the pipeline (and its pending card) intact.
	if existing, ok := sddPipelineFor(request.SessionID); ok && (existing.isIsolated || sameSddRepo(existing.repoRoot, request.RepoRoot)) {
		writeSddJSON(w, http.StatusOK, sddBindResponse(existing))
		return
	}

	// Concurrency detection + worktree provisioning (specs/011): a second pipeline in the same repo
	// is bound to an isolated worktree; the first/only pipeline keeps the main checkout (FR-005).
	effectiveRepoRoot, binding := resolveSddWorkspace(request.SessionID, request.RepoRoot)
	startSddPipeline(request.SessionID, effectiveRepoRoot, binding)
	pipeline, _ := sddPipelineFor(request.SessionID)
	writeSddJSON(w, http.StatusOK, sddBindResponse(pipeline))
}

// sddBindResponse builds the bind reply, carrying the worktree binding additively so existing
// clients ignore the extra fields while the frontend can show the isolation indicator (FR-007).
func sddBindResponse(pipeline *sddPipeline) map[string]any {
	response := map[string]any{"status": "bound"}
	if pipeline != nil && pipeline.isIsolated {
		response["isolated"] = true
		response["worktreePath"] = pipeline.worktreePath
		response["branch"] = pipeline.branch
	}
	return response
}

// sameSddRepo compares two repo roots for binding idempotency, tolerant of separator/casing diffs.
func sameSddRepo(left, right string) bool {
	normalize := func(path string) string { return strings.ToLower(filepath.ToSlash(strings.TrimRight(path, "/\\"))) }
	return normalize(left) == normalize(right)
}

// startSddPipeline creates (or replaces, if the repo changed) the pipeline for a session and
// starts its watcher. Eager: no feature is required up front. The binding records whether the
// pipeline runs in an isolated worktree (specs/011); repoRoot is already the worktree path then.
func startSddPipeline(sessionID, repoRoot string, binding sddWorktreeBinding) {
	// Replace any prior pipeline for this session (e.g. the session moved to a different repo).
	if old, ok := sddPipelineFor(sessionID); ok {
		old.watcher.Stop()
		sddPipelines.Delete(sessionID)
	}

	orchestrator := sdd.NewOrchestrator(sdd.Options{
		SessionID:      sessionID,
		HistoryBaseDir: sddStateDir(),
		Injector:       newSddInjector(),
		Broadcaster:    newSddBroadcaster(),
		Waiter:         newSddWaiter(),
	})

	// Broadcast phase status after every phase completion so the SddPipelinePanel updates live.
	orchestrator.Subscribe(func(_ sdd.PhaseName, _ string) {
		broadcastPhaseStatus(sessionID)
	})

	// Best-effort notifier on the shared completion seam (FR-011/012).
	notifier := sdd.NewNotifier()
	orchestrator.Subscribe(func(phase sdd.PhaseName, artifactPath string) {
		notifier.Notify(filepath.Base(orchestrator.State().FeatureDir), phase, artifactPath)
	})

	watcher := tutor.NewWatcher(repoRoot, "sdd-"+sessionID)
	if err := watcher.Start(); err != nil {
		log.Printf("[sdd] failed to start watcher on %s: %v", repoRoot, err)
		return
	}

	pipeline := &sddPipeline{
		orchestrator: orchestrator,
		watcher:      watcher,
		repoRoot:     repoRoot,
		gitCommonDir: binding.gitCommonDir,
		mainRepoRoot: binding.mainRepoRoot,
		worktreePath: binding.worktreePath,
		branch:       binding.branch,
		baseBranch:   binding.baseBranch,
		isIsolated:   binding.isIsolated,
	}
	sddPipelines.Store(sessionID, pipeline)
	go runSddDetector(pipeline, sessionID)
	log.Printf("[sdd] pipeline bound (eager): session=%s repo=%s isolated=%t", sessionID, repoRoot, binding.isIsolated)

	// On the first (main-checkout) bind to a repo, reclaim any merged+clean worktrees left over
	// from a previous run (specs/011, FR-013). Bound worktrees are skipped, so this is safe to run
	// while other tabs are open. Best-effort and async so the bind response is never blocked.
	if !binding.isIsolated && binding.gitCommonDir != "" {
		go sweepWorktreesOnStartup([]string{repoRoot})
	}
}

// runSddDetector consumes watcher notifications and gates each recognized phase artifact.
func runSddDetector(pipeline *sddPipeline, sessionID string) {
	for notification := range pipeline.watcher.Notifications() {
		for _, change := range notification.Files {
			gateSddArtifact(pipeline, sessionID, change.Path)
		}
	}
}

// gateSddArtifact classifies one changed file and, if it is a phase artifact, drives the
// two-step completion: (1) immediately marks the phase as running so the UI spinner appears,
// (2) waits for PTY silence on a goroutine before firing the completion seam to open the gate.
// This prevents the decision card from appearing while the agent is still writing output or
// awaiting a permission prompt. Duplicate watcher fires for an already-running phase are
// suppressed by MarkPhaseRunning returning false.
func gateSddArtifact(pipeline *sddPipeline, sessionID, changedPath string) {
	featureDir, featureRel, ok := deriveSddFeature(changedPath, pipeline.repoRoot)
	if !ok {
		return
	}
	content, err := os.ReadFile(filepath.Join(featureDir, filepath.FromSlash(featureRel)))
	if err != nil {
		return
	}
	phase, recognized := sdd.DetectCompletedPhase(featureRel, string(content))
	if !recognized {
		return
	}
	pipeline.orchestrator.BindSession(sessionID)
	pipeline.orchestrator.SetFeatureDir(featureDir)

	// Step 1 — mark running immediately so the UI spinner appears before the gate opens.
	// Returns false when the gate is already open (duplicate watcher fire) or the pipeline is
	// complete; skip in those cases to avoid corrupting orchestrator state.
	if !pipeline.orchestrator.MarkPhaseRunning(phase) {
		return
	}
	broadcastPhaseStatus(sessionID)

	// Step 2 — wait for PTY silence, then open the gate. This watcher path is now the FALLBACK
	// (specs/010, FR-002): the authoritative phase-event is the primary completion signal. If it
	// already opened this phase's gate while we were settling, the watcher stands down so the
	// phase is never completed twice.
	go func() {
		settleArtifactPhase(sessionID)
		state := pipeline.orchestrator.State()
		if state.Status == sdd.StatusAwaitingDecision && state.PendingCard != nil && state.PendingCard.Phase == phase {
			return
		}
		pipeline.orchestrator.HandlePhaseComplete(phase, featureRel)
	}()
}

// settleArtifactPhase blocks until the terminal goes quiet after an artifact-detected phase
// finishes writing, using the same floor/quiet/max constants as the PTY-quiet phases
// (Validate, Implement). This makes gate-open timing consistent across all pipeline phases
// regardless of their completion signal type.
func settleArtifactPhase(sessionID string) {
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
}

// deriveSddFeature splits a changed file path into the feature directory it belongs to and the
// path relative to that feature dir, recognizing the conventional specs/<feature>/<rel> layout.
// Returns false for any path not under a specs/<feature>/ tree.
func deriveSddFeature(changedPath, repoRoot string) (featureDir, featureRel string, ok bool) {
	relative := changedPath
	if filepath.IsAbs(relative) {
		if rebased, err := filepath.Rel(repoRoot, relative); err == nil {
			relative = rebased
		}
	}
	parts := strings.Split(filepath.ToSlash(relative), "/")
	// Need at least specs/<feature>/<file>.
	if len(parts) < 3 || parts[0] != "specs" || parts[1] == "" {
		return "", "", false
	}
	featureDir = filepath.Join(repoRoot, "specs", parts[1])
	featureRel = strings.Join(parts[2:], "/")
	return featureDir, featureRel, true
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
// SDD_PHASE_GATE message over the existing hub. For file-detected phases it also embeds
// a preview of the phase artifact (first sddArtifactMaxLines lines) so the frontend can
// render it inline without a separate fetch. Pty-quiet phases have no artifact to preview.
func newSddBroadcaster() sdd.GateBroadcaster {
	return sdd.BroadcasterFunc(func(card sdd.DecisionCard) error {
		if termHandler == nil {
			return nil
		}
		envelope := sddGateEnvelope{Type: "SDD_PHASE_GATE", DecisionCard: card}

		if pipeline, bound := sddPipelineFor(card.SessionID); bound {
			// Concise report card (US3): files touched + scope + decisions, the default gate surface.
			reportCard := buildSddPhaseReportCardForPipeline(pipeline, card.Phase)
			envelope.ReportCard = &reportCard

			// Artifact preview is the opt-in "view full output" source for file-detected phases (FR-009).
			if phase, ok := sdd.PhaseByName(card.Phase); ok && phase.ExpectedArtifact != "" {
				absPath := filepath.Join(pipeline.orchestrator.State().FeatureDir, phase.ExpectedArtifact)
				preview := readSddArtifactPreview(absPath, sddArtifactMaxLines)
				envelope.ArtifactPreview = &preview
			}
		}

		termHandler.BroadcastJSONToSession(card.SessionID, envelope)
		return nil
	})
}

// sddPhaseStatusEnvelope is the SDD_PHASE_STATUS on-wire message pushed after every
// phase completion and after every decision, so the status panel stays current.
type sddPhaseStatusEnvelope struct {
	Type      string                 `json:"type"`
	SessionID string                 `json:"sessionId"`
	Feature   string                 `json:"feature"`
	Phases    []sdd.PhaseStatusEntry `json:"phases"`
	Binding   sddBindingInfo         `json:"binding"`
}

// buildPhaseStatuses derives the display status for every pipeline phase. Orchestrator
// state is the primary source; disk truth overrides it for phases BEYOND the current
// position whose artifact file already exists — this prevents stale "pending" display
// when the watcher missed a completion event or the orchestrator's in-memory state lags
// the actual filesystem. Phases at or before the current position keep their
// orchestrator-derived status so open gates are never silently shown as complete.
func buildPhaseStatuses(pipeline *sddPipeline) []sdd.PhaseStatusEntry {
	state := pipeline.orchestrator.State()

	currentOrder := 0
	if state.CurrentPhase != "" {
		if cp, ok := sdd.PhaseByName(state.CurrentPhase); ok {
			currentOrder = cp.Order
		}
	}

	phases := sdd.PhaseTable()
	entries := make([]sdd.PhaseStatusEntry, 0, len(phases))
	for _, phase := range phases {
		runCount := pipeline.orchestrator.PhaseRunCount(phase.Name)
		displayStatus := derivePhaseDisplayStatus(phase.Order, currentOrder, state.Status, runCount)

		// Disk truth: a phase beyond the orchestrator's current position shows as complete
		// when its artifact already exists on disk. The guard `phase.Order > currentOrder`
		// ensures we never override an open gate or the currently-running phase.
		if phase.ExpectedArtifact != "" && state.FeatureDir != "" && phase.Order > currentOrder {
			artifactAbsPath := filepath.Join(state.FeatureDir, phase.ExpectedArtifact)
			if _, statErr := os.Stat(artifactAbsPath); statErr == nil {
				displayStatus = sdd.PhaseDisplayComplete
			}
		}

		// Build the absolute artifact path so the frontend can open the file
		// directly. Phases with no artifact (Validate, Implement) keep an empty
		// string; filepath.Join(dir, "") would return dir, not a file.
		artifactPath := ""
		if phase.ExpectedArtifact != "" {
			artifactPath = filepath.Join(state.FeatureDir, phase.ExpectedArtifact)
		}
		entries = append(entries, sdd.PhaseStatusEntry{
			Phase:         phase.Name,
			Order:         phase.Order,
			DisplayStatus: displayStatus,
			ArtifactPath:  artifactPath,
			DecidedAt:     nil,
			RunCount:      runCount,
		})
	}
	return entries
}

// derivePhaseDisplayStatus maps a phase's position in the pipeline to its UI display
// status. runCount is the number of completed runs for this phase; when it is ≥ 2 and
// the gate card is open, the phase is shown as iterating rather than awaiting-decision.
func derivePhaseDisplayStatus(phaseOrder, currentOrder int, pipelineStatus sdd.PipelineStatus, runCount int) sdd.PhaseDisplayStatus {
	switch {
	case currentOrder == 0:
		// No phases have started yet.
		return sdd.PhaseDisplayPending

	case phaseOrder < currentOrder:
		// Phases before the current one were all approved to get here.
		return sdd.PhaseDisplayComplete

	case phaseOrder == currentOrder:
		switch pipelineStatus {
		case sdd.StatusRunning:
			// Artifact detected; waiting for the terminal to go quiet before opening the gate.
			// The UI shows the active spinner while settlement is pending.
			return sdd.PhaseDisplayActive
		case sdd.StatusAwaitingDecision:
			// Re-run: runCount ≥ 2 means the gate has opened at least twice.
			if runCount >= 2 {
				return sdd.PhaseDisplayIterating
			}
			return sdd.PhaseDisplayAwaitingDecision
		case sdd.StatusRejected:
			return sdd.PhaseDisplayRejected
		case sdd.StatusAdvancing, sdd.StatusComplete:
			// The current phase was just approved.
			return sdd.PhaseDisplayComplete
		default:
			return sdd.PhaseDisplayPending
		}

	case phaseOrder == currentOrder+1 && pipelineStatus == sdd.StatusAdvancing:
		// The phase immediately after the approved one is now starting.
		return sdd.PhaseDisplayActive

	default:
		return sdd.PhaseDisplayPending
	}
}

// broadcastPhaseStatus pushes the full phase status array to all WebSocket clients
// in the session. Called after every HandlePhaseComplete and after every decision.
// ReconcileFromDisk runs first so the broadcast always reflects disk reality even when
// the file-system watcher missed a completion event earlier in the session.
func broadcastPhaseStatus(sessionID string) {
	pipeline, ok := sddPipelineFor(sessionID)
	if !ok || termHandler == nil {
		return
	}
	state := pipeline.orchestrator.State()
	if state.FeatureDir != "" {
		pipeline.orchestrator.ReconcileFromDisk(state.FeatureDir)
		state = pipeline.orchestrator.State() // re-read after potential advance
	}
	termHandler.BroadcastJSONToSession(sessionID, sddPhaseStatusEnvelope{
		Type:      "SDD_PHASE_STATUS",
		SessionID: sessionID,
		Feature:   filepath.Base(state.FeatureDir),
		Phases:    buildPhaseStatuses(pipeline),
		Binding:   sddBindingInfoFor(pipeline),
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
