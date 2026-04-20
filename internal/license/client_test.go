package license

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// withTestServer starts a test HTTP server, redirects WorkerBaseURL and the
// home dir to a temp folder, then restores both when the test ends.
func withTestServer(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	original := WorkerBaseURL
	WorkerBaseURL = srv.URL
	t.Cleanup(func() { WorkerBaseURL = original })

	// Redirect home so writeCache stays in the temp dir
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	return srv
}

// ── Activate ────────────────────────────────────────────────────────────────

func TestActivate_Success(t *testing.T) {
	expires := time.Now().Add(365 * 24 * time.Hour)
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/license/activate" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":     "tok_test_success",
			"email":     "user@example.com",
			"expiresAt": expires.Format(time.RFC3339),
		})
	}))

	info, err := Activate("FORGE-VALID-KEY")
	if err != nil {
		t.Fatalf("Activate: unexpected error: %v", err)
	}
	if info.Token != "tok_test_success" {
		t.Errorf("Token: got %q, want %q", info.Token, "tok_test_success")
	}
	if info.Email != "user@example.com" {
		t.Errorf("Email: got %q, want %q", info.Email, "user@example.com")
	}
	if info.Key != "FORGE-VALID-KEY" {
		t.Errorf("Key: got %q, want %q", info.Key, "FORGE-VALID-KEY")
	}
}

func TestActivate_MachineLimit(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusPaymentRequired)
	}))

	_, err := Activate("FORGE-LIMITED-KEY")
	if err == nil {
		t.Fatal("expected error for 402 response, got nil")
	}
}

func TestActivate_KeyNotFound(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))

	_, err := Activate("FORGE-BAD-KEY")
	if err == nil {
		t.Fatal("expected error for 404 response, got nil")
	}
}

func TestActivate_Suspended(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))

	_, err := Activate("FORGE-SUSPENDED-KEY")
	if err == nil {
		t.Fatal("expected error for 403 response, got nil")
	}
}

func TestActivate_ServerError(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))

	_, err := Activate("FORGE-KEY")
	if err == nil {
		t.Fatal("expected error for 500 response, got nil")
	}
}

// ── Validate ────────────────────────────────────────────────────────────────

func TestValidate_ReturnsOKStatus(t *testing.T) {
	expires := time.Now().Add(365 * 24 * time.Hour)
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/license/validate" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		// Verify Bearer token is forwarded
		if r.Header.Get("Authorization") != "Bearer tok_validate" {
			t.Errorf("Authorization header: got %q", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"expiresAt": expires.Format(time.RFC3339),
		})
	}))

	info := &Info{Key: "k", Token: "tok_validate", LastCheck: time.Now()}
	// Seed the cache so writeCache inside Validate has somewhere to write
	if err := writeCache(info); err != nil {
		t.Fatalf("seeding cache: %v", err)
	}

	status, err := Validate(info)
	if err != nil {
		t.Fatalf("Validate: unexpected error: %v", err)
	}
	if status != StatusOK {
		t.Errorf("status: got %q, want %q", status, StatusOK)
	}
	// GracePeriodExpires should be cleared on OK
	if info.GracePeriodExpires != nil {
		t.Error("GracePeriodExpires should be nil after successful validation")
	}
}

func TestValidate_NetworkError_ReturnsGrace(t *testing.T) {
	// Point at a closed server so the HTTP call fails
	original := WorkerBaseURL
	WorkerBaseURL = "http://localhost:1" // refused connection
	t.Cleanup(func() { WorkerBaseURL = original })
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	info := &Info{Key: "k", Token: "t", LastCheck: time.Now()}
	status, err := Validate(info)
	if err == nil {
		t.Fatal("expected network error, got nil")
	}
	if status != StatusGrace {
		t.Errorf("status on network failure: got %q, want %q", status, StatusGrace)
	}
}

// ── Deactivate ──────────────────────────────────────────────────────────────

func TestDeactivate_Success(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/license/deactivate" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	// Write a cache so clearCache has something to remove
	info := &Info{Key: "k", Token: "t", Email: "e@e.com", LastCheck: time.Now()}
	if err := writeCache(info); err != nil {
		t.Fatalf("seeding cache: %v", err)
	}

	if err := Deactivate(info); err != nil {
		t.Fatalf("Deactivate: unexpected error: %v", err)
	}

	// Cache should now be gone
	_, err := readCache()
	if err == nil {
		t.Error("expected cache to be cleared after Deactivate, but readCache succeeded")
	}
}

func TestDeactivate_ServerError(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))

	info := &Info{Key: "k", Token: "t", LastCheck: time.Now()}
	if err := writeCache(info); err != nil {
		t.Fatalf("seeding cache: %v", err)
	}

	err := Deactivate(info)
	if err == nil {
		t.Error("expected error for 500 response, got nil")
	}
}

// ── SignedDownloadURL ────────────────────────────────────────────────────────

func TestSignedDownloadURL_Success(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/download" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("version") == "" || r.URL.Query().Get("platform") == "" {
			t.Error("version and platform query params expected")
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"url": "https://example.com/forge.exe"})
	}))

	info := &Info{Key: "k", Token: "tok_dl"}
	url, err := SignedDownloadURL(info, "v7.2.4", "windows")
	if err != nil {
		t.Fatalf("SignedDownloadURL: %v", err)
	}
	if url != "https://example.com/forge.exe" {
		t.Errorf("url: got %q, want %q", url, "https://example.com/forge.exe")
	}
}

func TestSignedDownloadURL_Unauthorized(t *testing.T) {
	withTestServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))

	info := &Info{Key: "k", Token: "tok_expired"}
	_, err := SignedDownloadURL(info, "v7.2.4", "windows")
	if err == nil {
		t.Error("expected error for 401, got nil")
	}
}
