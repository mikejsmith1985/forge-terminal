// sdd_wiring_test.go — verifies the per-session/eager wiring helpers: deriving a feature from an
// artifact path, repo-equality for bind idempotency, the SDD_PHASE_GATE envelope shape, and eager
// bind behavior (a session binds even with no feature yet, and re-binding the same repo is a no-op).
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
