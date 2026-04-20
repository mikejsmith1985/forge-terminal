package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/mikejsmith1985/forge-terminal/internal/license"
)

// saveLicenseGlobals returns a function that restores the license package-level globals.
func saveLicenseGlobals() func() {
	savedGated := licenseGated
	savedStatus := activeLicenseStatus
	savedInfo := activeLicenseInfo
	return func() {
		licenseGated = savedGated
		activeLicenseStatus = savedStatus
		activeLicenseInfo = savedInfo
	}
}

// ── LicenseMiddleware ────────────────────────────────────────────────────────

func TestLicenseMiddleware_BlocksWhenGated(t *testing.T) {
	defer saveLicenseGlobals()()
	licenseGated = true

	called := false
	handler := LicenseMiddleware(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if called {
		t.Error("inner handler should not be called when licenseGated=true")
	}
	if rec.Code != http.StatusPaymentRequired {
		t.Errorf("status = %d, want 402", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("response body not JSON: %v", err)
	}
	if body["code"] != "license_required" {
		t.Errorf("code = %q, want license_required", body["code"])
	}
}

func TestLicenseMiddleware_PassesThroughWhenUnlocked(t *testing.T) {
	defer saveLicenseGlobals()()
	licenseGated = false

	called := false
	handler := LicenseMiddleware(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if !called {
		t.Error("inner handler should be called when licenseGated=false")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

// ── rootlevellabsOrigin ──────────────────────────────────────────────────────

func TestRootlevellabsOrigin(t *testing.T) {
	cases := []struct {
		origin string
		want   bool
	}{
		{"https://rootlevellabs.tech", true},
		{"https://license.rootlevellabs.tech", true},
		{"https://app.rootlevellabs.tech", true},
		{"http://rootlevellabs.tech", false},   // HTTP not HTTPS
		{"https://evil-rootlevellabs.tech", false}, // not a real subdomain
		{"https://google.com", false},
		{"", false},
	}

	for _, tc := range cases {
		got := rootlevellabsOrigin(tc.origin)
		if got != tc.want {
			t.Errorf("rootlevellabsOrigin(%q) = %v, want %v", tc.origin, got, tc.want)
		}
	}
}

// ── handleLicenseStatus ──────────────────────────────────────────────────────

func TestHandleLicenseStatus_OKWithInfo(t *testing.T) {
	defer saveLicenseGlobals()()
	expires := time.Now().Add(365 * 24 * time.Hour)
	activeLicenseStatus = license.StatusOK
	activeLicenseInfo = &license.Info{
		Key:       "FORGE-TEST",
		Token:     "tok_test",
		Email:     "test@example.com",
		ExpiresAt: expires,
		LastCheck: time.Now(),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/license/status", nil)
	rec := httptest.NewRecorder()
	handleLicenseStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if body["status"] != "ok" {
		t.Errorf("status field = %q, want ok", body["status"])
	}
	if body["email"] != "test@example.com" {
		t.Errorf("email = %q, want test@example.com", body["email"])
	}
	if body["expiresAt"] == "" {
		t.Error("expiresAt should be set when info is present")
	}
}

func TestHandleLicenseStatus_Required(t *testing.T) {
	defer saveLicenseGlobals()()
	activeLicenseStatus = license.StatusRequired
	activeLicenseInfo = nil

	req := httptest.NewRequest(http.MethodGet, "/api/license/status", nil)
	rec := httptest.NewRecorder()
	handleLicenseStatus(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 (status is in body, not HTTP code)", rec.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if body["status"] != string(license.StatusRequired) {
		t.Errorf("status = %q, want %q", body["status"], license.StatusRequired)
	}
}

func TestHandleLicenseStatus_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/license/status", nil)
	rec := httptest.NewRecorder()
	handleLicenseStatus(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

// ── handleLicenseActivate ────────────────────────────────────────────────────

func TestHandleLicenseActivate_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/license/activate", nil)
	rec := httptest.NewRecorder()
	handleLicenseActivate(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHandleLicenseActivate_EmptyKey(t *testing.T) {
	body := bytes.NewBufferString(`{"key": ""}`)
	req := httptest.NewRequest(http.MethodPost, "/api/license/activate", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleLicenseActivate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

func TestHandleLicenseActivate_InvalidJSON(t *testing.T) {
	body := bytes.NewBufferString(`not json`)
	req := httptest.NewRequest(http.MethodPost, "/api/license/activate", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handleLicenseActivate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

// ── handleLicenseDeactivate ──────────────────────────────────────────────────

func TestHandleLicenseDeactivate_MethodNotAllowed(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/license/deactivate", nil)
	rec := httptest.NewRecorder()
	handleLicenseDeactivate(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHandleLicenseDeactivate_NoActiveLicense(t *testing.T) {
	defer saveLicenseGlobals()()
	activeLicenseInfo = nil

	req := httptest.NewRequest(http.MethodPost, "/api/license/deactivate", nil)
	rec := httptest.NewRecorder()
	handleLicenseDeactivate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}
