// sdd_wiring_test.go — verifies the SDD wiring helpers: feature-dir resolution, mapping a
// watcher path to a feature-relative path, the SDD_PHASE_GATE envelope shape, and bind
// request validation. The watcher-starting success path is exercised by the live app, not here.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/sdd"
)

func TestResolveSddFeatureDir(t *testing.T) {
	repo := t.TempDir()
	specifyDir := filepath.Join(repo, ".specify")
	if err := os.MkdirAll(specifyDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(specifyDir, "feature.json"),
		[]byte(`{"feature_directory":"specs/003-sdd-phase-orchestrator"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	dir, ok := resolveSddFeatureDir(repo)
	if !ok {
		t.Fatalf("expected to resolve feature dir")
	}
	if filepath.Base(dir) != "003-sdd-phase-orchestrator" {
		t.Errorf("feature dir = %q, want it to end with the feature name", dir)
	}

	if _, ok := resolveSddFeatureDir(t.TempDir()); ok {
		t.Errorf("a repo without .specify/feature.json must not resolve")
	}
}

func TestSddFeatureRel(t *testing.T) {
	repo := t.TempDir() // a genuine absolute path (with a volume on Windows)
	feature := filepath.Join(repo, "specs", "003-feat")

	if rel, ok := sddFeatureRel(filepath.Join("specs", "003-feat", "spec.md"), repo, feature); !ok || rel != "spec.md" {
		t.Errorf("repo-relative change = (%q, %v), want (spec.md, true)", rel, ok)
	}
	if rel, ok := sddFeatureRel(filepath.Join(feature, "plan.md"), repo, feature); !ok || rel != "plan.md" {
		t.Errorf("absolute change = (%q, %v), want (plan.md, true)", rel, ok)
	}
	if _, ok := sddFeatureRel(filepath.Join("README.md"), repo, feature); ok {
		t.Errorf("a file outside the feature dir must be rejected")
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

func TestHandleSddBind_Validation(t *testing.T) {
	missing := httptest.NewRecorder()
	handleSddBind(missing, httptest.NewRequest(http.MethodPost, "/api/sdd/bind", strings.NewReader(`{}`)))
	if missing.Code != http.StatusBadRequest {
		t.Errorf("missing fields status = %d, want 400", missing.Code)
	}

	noFeature := httptest.NewRecorder()
	body := `{"sessionId":"s1","repoRoot":"` + strings.ReplaceAll(t.TempDir(), `\`, `\\`) + `"}`
	handleSddBind(noFeature, httptest.NewRequest(http.MethodPost, "/api/sdd/bind", strings.NewReader(body)))
	if noFeature.Code != http.StatusConflict {
		t.Errorf("no-feature status = %d, want 409", noFeature.Code)
	}
}
