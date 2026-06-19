// sdd_wiring_test.go — verifies the per-session/eager wiring helpers: deriving a feature from an
// artifact path, repo-equality for bind idempotency, the SDD_PHASE_GATE envelope shape, and eager
// bind behavior (a session binds even with no feature yet, and re-binding the same repo is a no-op).
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

func TestDeriveSddFeature(t *testing.T) {
	repo := t.TempDir() // genuine absolute path (drive-qualified on Windows)
	cases := []struct {
		name        string
		changed     string
		wantFeature string // basename of the feature dir
		wantRel     string
		wantOK      bool
	}{
		{"repo-relative spec", filepath.Join("specs", "003-feat", "spec.md"), "003-feat", "spec.md", true},
		{"absolute plan", filepath.Join(repo, "specs", "003-feat", "plan.md"), "003-feat", "plan.md", true},
		{"nested artifact", filepath.Join("specs", "003-feat", "contracts", "x.md"), "003-feat", "contracts/x.md", true},
		{"outside specs", "README.md", "", "", false},
		{"feature dir only (no file)", filepath.Join("specs", "003-feat"), "", "", false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			featureDir, featureRel, ok := deriveSddFeature(testCase.changed, repo)
			if ok != testCase.wantOK {
				t.Fatalf("ok = %v, want %v", ok, testCase.wantOK)
			}
			if !ok {
				return
			}
			if filepath.Base(featureDir) != testCase.wantFeature || featureRel != testCase.wantRel {
				t.Errorf("got (%q, %q), want feature %q rel %q", filepath.Base(featureDir), featureRel, testCase.wantFeature, testCase.wantRel)
			}
		})
	}
}

func TestSameSddRepo(t *testing.T) {
	cases := []struct {
		left, right string
		want        bool
	}{
		{"C:/a/b", "C:/a/b", true},
		{"C:/a/b", "C:/a/b/", true},          // trailing slash tolerated
		{`C:\a\b`, "C:/a/b", true},            // separator-insensitive
		{"C:/A/B", "c:/a/b", true},            // case-insensitive (Windows)
		{"C:/a/b", "C:/a/c", false},
	}
	for _, testCase := range cases {
		if got := sameSddRepo(testCase.left, testCase.right); got != testCase.want {
			t.Errorf("sameSddRepo(%q,%q) = %v, want %v", testCase.left, testCase.right, got, testCase.want)
		}
	}
}

func TestSddGateEnvelope_FlattensWithType(t *testing.T) {
	envelope := sddGateEnvelope{
		Type: "SDD_PHASE_GATE",
		DecisionCard: sdd.DecisionCard{
			ID:      "c1",
			Phase:   sdd.PhasePlan,
			Actions: []sdd.Action{sdd.ActionApprove, sdd.ActionReject, sdd.ActionClarify},
		},
	}
	raw, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	encoded := string(raw)
	for _, want := range []string{`"type":"SDD_PHASE_GATE"`, `"cardId":"c1"`, `"phase":"plan"`, `"actions":`} {
		if !strings.Contains(encoded, want) {
			t.Errorf("envelope JSON missing %s: %s", want, encoded)
		}
	}
}

func TestHandleSddBind_RequiresFields(t *testing.T) {
	recorder := httptest.NewRecorder()
	handleSddBind(recorder, httptest.NewRequest(http.MethodPost, "/api/sdd/bind", strings.NewReader(`{}`)))
	if recorder.Code != http.StatusBadRequest {
		t.Errorf("missing fields status = %d, want 400", recorder.Code)
	}
}

// Eager bind: a session binds even when the repo has no .specify/feature.json yet (the feature
// is learned lazily when an artifact appears). And re-binding the same repo is a no-op that
// reuses the existing pipeline rather than replacing it (which would invalidate an open card).
// --- T016: buildPhaseStatuses unit tests (Red: fails until T008 implements the function) ---

// newTestPipeline creates a fresh sddPipeline with a mocked orchestrator for unit tests.
// The orchestrator uses a temp dir for history so no real ~/.forge/sdd is touched.
func newTestPipeline(t *testing.T, sessionID string) *sddPipeline {
	t.Helper()
	orchestrator := sdd.NewOrchestrator(sdd.Options{
		SessionID:      sessionID,
		HistoryBaseDir: t.TempDir(),
		Injector:       sdd.InjectorFunc(func(string, string) error { return nil }),
		Broadcaster:    sdd.BroadcasterFunc(func(sdd.DecisionCard) error { return nil }),
		Summarize:      func(sdd.PhaseName) sdd.PhaseSummary { return sdd.PhaseSummary{Headline: "H"} },
		NewCardID:      func(p sdd.PhaseName) string { return "card-" + string(p) },
	})
	return &sddPipeline{orchestrator: orchestrator, repoRoot: t.TempDir()}
}

func TestBuildPhaseStatuses_NoPhasesStarted_AllPending(t *testing.T) {
	pipeline := newTestPipeline(t, "idle-sess")

	statuses := buildPhaseStatuses(pipeline)

	if len(statuses) != 6 {
		t.Fatalf("expected 6 phase statuses, got %d", len(statuses))
	}
	for _, entry := range statuses {
		if entry.DisplayStatus != sdd.PhaseDisplayPending {
			t.Errorf("phase %s: expected pending, got %s", entry.Phase, entry.DisplayStatus)
		}
	}
}

func TestBuildPhaseStatuses_TwoPhasesComplete_CorrectStatuses(t *testing.T) {
	pipeline := newTestPipeline(t, "two-done-sess")
	// Complete specify → approve → complete clarify → approve leaves Status=Advancing, CurrentPhase=clarify
	pipeline.orchestrator.HandlePhaseComplete(sdd.PhaseSpecify, "spec.md")
	if _, err := pipeline.orchestrator.SubmitDecision(sdd.Decision{Phase: sdd.PhaseSpecify, Action: sdd.ActionApprove}); err != nil {
		t.Fatalf("approve specify: %v", err)
	}
	pipeline.orchestrator.HandlePhaseComplete(sdd.PhaseClarify, "spec.md")
	if _, err := pipeline.orchestrator.SubmitDecision(sdd.Decision{Phase: sdd.PhaseClarify, Action: sdd.ActionApprove}); err != nil {
		t.Fatalf("approve clarify: %v", err)
	}

	statuses := buildPhaseStatuses(pipeline)

	wantStatuses := map[sdd.PhaseName]sdd.PhaseDisplayStatus{
		sdd.PhaseSpecify:   sdd.PhaseDisplayComplete,
		sdd.PhaseClarify:   sdd.PhaseDisplayComplete,
		sdd.PhasePlan:      sdd.PhaseDisplayActive,
		sdd.PhaseValidate:  sdd.PhaseDisplayPending,
		sdd.PhaseImplement: sdd.PhaseDisplayPending,
	}
	for _, entry := range statuses {
		if want, ok := wantStatuses[entry.Phase]; ok && entry.DisplayStatus != want {
			t.Errorf("phase %s: got %s, want %s", entry.Phase, entry.DisplayStatus, want)
		}
	}
}

func TestBuildPhaseStatuses_PhaseRejected_PipelineStopped(t *testing.T) {
	pipeline := newTestPipeline(t, "reject-sess")
	// Approve specify, then reject clarify
	pipeline.orchestrator.HandlePhaseComplete(sdd.PhaseSpecify, "spec.md")
	if _, err := pipeline.orchestrator.SubmitDecision(sdd.Decision{Phase: sdd.PhaseSpecify, Action: sdd.ActionApprove}); err != nil {
		t.Fatalf("approve specify: %v", err)
	}
	pipeline.orchestrator.HandlePhaseComplete(sdd.PhaseClarify, "spec.md")
	if _, err := pipeline.orchestrator.SubmitDecision(sdd.Decision{Phase: sdd.PhaseClarify, Action: sdd.ActionReject}); err != nil {
		t.Fatalf("reject clarify: %v", err)
	}

	statuses := buildPhaseStatuses(pipeline)

	wantStatuses := map[sdd.PhaseName]sdd.PhaseDisplayStatus{
		sdd.PhaseSpecify:   sdd.PhaseDisplayComplete,
		sdd.PhaseClarify:   sdd.PhaseDisplayRejected,
		sdd.PhasePlan:      sdd.PhaseDisplayPending,
		sdd.PhaseValidate:  sdd.PhaseDisplayPending,
		sdd.PhaseImplement: sdd.PhaseDisplayPending,
	}
	for _, entry := range statuses {
		if want, ok := wantStatuses[entry.Phase]; ok && entry.DisplayStatus != want {
			t.Errorf("phase %s: got %s, want %s", entry.Phase, entry.DisplayStatus, want)
		}
	}
}

func TestBuildPhaseStatuses_ArtifactPaths_AbsoluteWhenFeatureDirSet(t *testing.T) {
	pipeline := newTestPipeline(t, "artifact-path-sess")
	featureDir := filepath.Join(t.TempDir(), "specs", "007-my-feature")
	pipeline.orchestrator.SetFeatureDir(featureDir)

	statuses := buildPhaseStatuses(pipeline)

	// Phases that produce a file artifact must carry the absolute path so the
	// frontend can open the file without resolving against the working directory.
	wantArtifactPaths := map[sdd.PhaseName]string{
		sdd.PhaseSpecify:       filepath.Join(featureDir, "spec.md"),
		sdd.PhaseClarify:       filepath.Join(featureDir, "spec.md"),
		sdd.PhasePlan:          filepath.Join(featureDir, "plan.md"),
		sdd.PhaseTasksGenerate: filepath.Join(featureDir, "tasks.md"),
		sdd.PhaseValidate:      "",
		sdd.PhaseImplement:     "",
	}
	for _, entry := range statuses {
		want, isDefined := wantArtifactPaths[entry.Phase]
		if !isDefined {
			t.Errorf("unexpected phase %s in statuses", entry.Phase)
			continue
		}
		if entry.ArtifactPath != want {
			t.Errorf("phase %s: ArtifactPath = %q, want %q", entry.Phase, entry.ArtifactPath, want)
		}
	}
}

func TestBuildPhaseStatuses_ArtifactPaths_EmptyForNoArtifactPhases(t *testing.T) {
	pipeline := newTestPipeline(t, "no-artifact-sess")
	pipeline.orchestrator.SetFeatureDir(filepath.Join(t.TempDir(), "specs", "007-no-art"))

	statuses := buildPhaseStatuses(pipeline)

	noArtifactPhases := map[sdd.PhaseName]bool{
		sdd.PhaseValidate:  true,
		sdd.PhaseImplement: true,
	}
	for _, entry := range statuses {
		if noArtifactPhases[entry.Phase] && entry.ArtifactPath != "" {
			t.Errorf("phase %s: expected empty ArtifactPath for no-artifact phase, got %q", entry.Phase, entry.ArtifactPath)
		}
	}
}

// --- end T016 ---

// --- T005: derivePhaseDisplayStatus run-count tests (Red until T006 adds runCount param) ---

func TestDerivePhaseDisplayStatus_IteratingWhenRunCountGe2AndAwaiting(t *testing.T) {
	// phaseOrder == currentOrder, status == AwaitingDecision, runCount >= 2 → iterating
	got := derivePhaseDisplayStatus(2, 2, sdd.StatusAwaitingDecision, 2)
	if got != sdd.PhaseDisplayIterating {
		t.Errorf("runCount=2 awaiting → got %q, want iterating", got)
	}
	got = derivePhaseDisplayStatus(2, 2, sdd.StatusAwaitingDecision, 5)
	if got != sdd.PhaseDisplayIterating {
		t.Errorf("runCount=5 awaiting → got %q, want iterating", got)
	}
}

func TestDerivePhaseDisplayStatus_AwaitingDecisionWhenRunCount1(t *testing.T) {
	// phaseOrder == currentOrder, status == AwaitingDecision, runCount == 1 → awaiting-decision
	got := derivePhaseDisplayStatus(2, 2, sdd.StatusAwaitingDecision, 1)
	if got != sdd.PhaseDisplayAwaitingDecision {
		t.Errorf("runCount=1 awaiting → got %q, want awaiting-decision", got)
	}
}

func TestDerivePhaseDisplayStatus_ExistingCasesUnchanged(t *testing.T) {
	// Existing behaviour (no phases started, phase before current, rejected) must be unaffected.
	cases := []struct {
		phaseOrder, currentOrder int
		status                   sdd.PipelineStatus
		runCount                 int
		want                     sdd.PhaseDisplayStatus
	}{
		{1, 0, sdd.StatusIdle, 0, sdd.PhaseDisplayPending},
		{1, 2, sdd.StatusAwaitingDecision, 0, sdd.PhaseDisplayComplete},
		{2, 2, sdd.StatusRejected, 1, sdd.PhaseDisplayRejected},
		{3, 2, sdd.StatusAdvancing, 0, sdd.PhaseDisplayActive},
		{4, 2, sdd.StatusAdvancing, 0, sdd.PhaseDisplayPending},
	}
	for _, tc := range cases {
		got := derivePhaseDisplayStatus(tc.phaseOrder, tc.currentOrder, tc.status, tc.runCount)
		if got != tc.want {
			t.Errorf("derivePhaseDisplayStatus(%d,%d,%q,%d) = %q, want %q",
				tc.phaseOrder, tc.currentOrder, tc.status, tc.runCount, got, tc.want)
		}
	}
}

// --- end T005 ---

// --- T023: readSddArtifactPreview unit tests (Red: fails until T020 implements the function) ---

func TestReadSddArtifactPreview_ShortFile_NotTruncated(t *testing.T) {
	dir := t.TempDir()
	content := "line one\nline two\nline three\n"
	path := filepath.Join(dir, "spec.md")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	preview := readSddArtifactPreview(path, 200)

	if preview.IsTruncated {
		t.Errorf("short file should not be truncated, got IsTruncated=true")
	}
	if preview.TotalLines != 3 {
		t.Errorf("TotalLines = %d, want 3", preview.TotalLines)
	}
	if !strings.Contains(preview.Content, "line one") {
		t.Errorf("content missing 'line one': %q", preview.Content)
	}
	if preview.FilePath != path {
		t.Errorf("FilePath = %q, want %q", preview.FilePath, path)
	}
}

func TestReadSddArtifactPreview_LongFile_Truncated(t *testing.T) {
	dir := t.TempDir()
	var sb strings.Builder
	for i := 1; i <= 250; i++ {
		fmt.Fprintf(&sb, "line %d\n", i)
	}
	path := filepath.Join(dir, "plan.md")
	if err := os.WriteFile(path, []byte(sb.String()), 0o644); err != nil {
		t.Fatal(err)
	}

	preview := readSddArtifactPreview(path, 200)

	if !preview.IsTruncated {
		t.Errorf("long file should be truncated, got IsTruncated=false")
	}
	if preview.TotalLines != 250 {
		t.Errorf("TotalLines = %d, want 250", preview.TotalLines)
	}
	// Content must contain exactly maxLines lines (200).
	got := strings.Count(strings.TrimRight(preview.Content, "\n"), "\n") + 1
	if got != 200 {
		t.Errorf("truncated content has %d lines, want 200", got)
	}
}

func TestReadSddArtifactPreview_MissingFile_EmptyContent(t *testing.T) {
	preview := readSddArtifactPreview("/no/such/file.md", 200)

	if preview.Content != "" {
		t.Errorf("missing file should yield empty content, got %q", preview.Content)
	}
	if preview.IsTruncated {
		t.Errorf("missing file should not be truncated, got IsTruncated=true")
	}
}

// --- end T023 ---

func TestHandleSddBind_EagerAndIdempotent(t *testing.T) {
	repo := t.TempDir() // no .specify/feature.json — eager bind must still succeed
	sessionID := "bind-test-session"
	body := `{"sessionId":"` + sessionID + `","repoRoot":"` + strings.ReplaceAll(repo, `\`, `\\`) + `"}`

	first := httptest.NewRecorder()
	handleSddBind(first, httptest.NewRequest(http.MethodPost, "/api/sdd/bind", strings.NewReader(body)))
	t.Cleanup(func() {
		if pipeline, ok := sddPipelineFor(sessionID); ok {
			pipeline.watcher.Stop()
			sddPipelines.Delete(sessionID)
		}
	})
	if first.Code != http.StatusOK || !strings.Contains(first.Body.String(), "bound") {
		t.Fatalf("eager bind status = %d body = %s, want 200 bound", first.Code, first.Body.String())
	}
	pipelineOne, ok := sddPipelineFor(sessionID)
	if !ok {
		t.Fatalf("expected a pipeline registered for %s", sessionID)
	}

	// Second identical bind must reuse the same pipeline (no replacement → no card invalidation).
	second := httptest.NewRecorder()
	handleSddBind(second, httptest.NewRequest(http.MethodPost, "/api/sdd/bind", strings.NewReader(body)))
	if second.Code != http.StatusOK {
		t.Fatalf("re-bind status = %d, want 200", second.Code)
	}
	pipelineTwo, _ := sddPipelineFor(sessionID)
	if pipelineOne != pipelineTwo {
		t.Errorf("re-binding the same repo must reuse the pipeline, not replace it")
	}
}
