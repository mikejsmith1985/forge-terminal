// handlers_companion_test.go — round-trip tests for the companion
// preference REST handler.  Uses a temp HOME so the on-disk preference
// file is fully isolated from the developer's real ~/.forge directory.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// withTempHome points os.UserHomeDir at a temp directory for the duration
// of the test.  Both USERPROFILE (Windows) and HOME (POSIX) are set so
// the test passes on every supported platform.
func withTempHome(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("USERPROFILE", dir)
	t.Setenv("HOME", dir)
}

func TestHandleCompanionPreference_GetDefault(t *testing.T) {
	withTempHome(t)

	req := httptest.NewRequest(http.MethodGet, "/api/companion/preference", nil)
	rec := httptest.NewRecorder()
	handleCompanionPreference(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got["method"] != "" {
		t.Errorf("expected empty method when no preference saved, got %v", got["method"])
	}
	if got["methodResolved"] != "named" {
		t.Errorf("expected methodResolved=named (default), got %v", got["methodResolved"])
	}
}

func TestHandleCompanionPreference_PostThenGet(t *testing.T) {
	withTempHome(t)

	post := httptest.NewRequest(http.MethodPost, "/api/companion/preference",
		strings.NewReader(`{"method":"tailscale"}`))
	post.Header.Set("Content-Type", "application/json")
	postRec := httptest.NewRecorder()
	handleCompanionPreference(postRec, post)
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST expected 200, got %d body=%s", postRec.Code, postRec.Body.String())
	}

	get := httptest.NewRequest(http.MethodGet, "/api/companion/preference", nil)
	getRec := httptest.NewRecorder()
	handleCompanionPreference(getRec, get)
	var got map[string]any
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got["method"] != "tailscale" {
		t.Errorf("expected persisted method=tailscale, got %v", got["method"])
	}
	if got["methodResolved"] != "tailscale" {
		t.Errorf("expected methodResolved to mirror saved preference, got %v", got["methodResolved"])
	}
}

func TestHandleCompanionPreference_RejectsUnknownMethod(t *testing.T) {
	withTempHome(t)

	req := httptest.NewRequest(http.MethodPost, "/api/companion/preference",
		strings.NewReader(`{"method":"lan"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleCompanionPreference(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for unknown method, got %d", rec.Code)
	}
}

func TestHandleCompanionPreference_EmptyMethodClears(t *testing.T) {
	withTempHome(t)

	// Save a preference first.
	if err := saveCompanionPreference(CompanionMethodQuick); err != nil {
		t.Fatalf("seed save: %v", err)
	}

	clear := httptest.NewRequest(http.MethodPost, "/api/companion/preference",
		strings.NewReader(`{"method":""}`))
	clear.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleCompanionPreference(rec, clear)
	if rec.Code != http.StatusOK {
		t.Fatalf("clear expected 200, got %d", rec.Code)
	}

	// After clearing, GET returns no method but methodResolved=named.
	get := httptest.NewRequest(http.MethodGet, "/api/companion/preference", nil)
	getRec := httptest.NewRecorder()
	handleCompanionPreference(getRec, get)
	var got map[string]any
	_ = json.Unmarshal(getRec.Body.Bytes(), &got)
	if got["method"] != "" {
		t.Errorf("expected method cleared, got %v", got["method"])
	}
}

func TestHandleCompanionPreference_MethodNotAllowed(t *testing.T) {
	withTempHome(t)

	req := httptest.NewRequest(http.MethodDelete, "/api/companion/preference", nil)
	rec := httptest.NewRecorder()
	handleCompanionPreference(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 for DELETE, got %d", rec.Code)
	}
}
