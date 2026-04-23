package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mikejsmith1985/forge-terminal/internal/tunnel"
)

// assertStatus is a tiny helper to avoid repeating the same 5-line
// check across every handler test.
func assertStatus(t *testing.T, rr *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rr.Code != want {
		t.Errorf("status = %d, want %d (body=%s)", rr.Code, want, rr.Body.String())
	}
}

func TestTunnelSetupInstall_RejectsNonPOST(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/install", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupInstall(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupLogin_RejectsNonPOST(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/login", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLogin(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupLoginStatus_RejectsNonGET(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/login/status", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLoginStatus(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupLoginCancel_RejectsNonPOST(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/login/cancel", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLoginCancel(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupLoginStatus_IdleWhenNoSession(t *testing.T) {
	loginMu.Lock()
	prev := currentLogin
	currentLogin = nil
	loginMu.Unlock()
	t.Cleanup(func() {
		loginMu.Lock()
		currentLogin = prev
		loginMu.Unlock()
	})

	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/login/status", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLoginStatus(w, r)
	assertStatus(t, w, http.StatusOK)

	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body["status"] != "idle" {
		t.Errorf("status = %q, want idle (body=%s)", body["status"], w.Body.String())
	}
}

func TestTunnelSetupLoginCancel_NoopWhenNoSession(t *testing.T) {
	loginMu.Lock()
	prev := currentLogin
	currentLogin = nil
	loginMu.Unlock()
	t.Cleanup(func() {
		loginMu.Lock()
		currentLogin = prev
		loginMu.Unlock()
	})

	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/login/cancel", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLoginCancel(w, r)
	assertStatus(t, w, http.StatusNoContent)
}

func TestTunnelSetupLogin_ErrorWhenCloudflaredMissing(t *testing.T) {
	loginMu.Lock()
	prev := currentLogin
	currentLogin = nil
	loginMu.Unlock()
	t.Cleanup(func() {
		loginMu.Lock()
		if currentLogin != nil && currentLogin != prev {
			currentLogin.Cancel()
		}
		currentLogin = prev
		loginMu.Unlock()
	})

	// If cloudflared is present on the host we'd actually spawn the
	// login flow; skip so this test stays hermetic on developer
	// machines that have completed the setup locally.
	if tunnel.ResolvePath() != "" {
		t.Skip("cloudflared present on host; cannot exercise missing-binary path")
	}

	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/login", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupLogin(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 (body=%s)", w.Code, w.Body.String())
	}
}

func TestTunnelSetupZones_RejectsNonGET(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/zones", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupZones(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupCreate_RejectsNonPOST(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/create", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupCreate(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

func TestTunnelSetupCreate_BadJSON(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/create",
		strings.NewReader("not json"))
	w := httptest.NewRecorder()
	handleTunnelSetupCreate(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestTunnelSetupCreate_InvalidHostname(t *testing.T) {
	body := strings.NewReader(`{"hostname":"bad host","localPort":3005}`)
	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/create", body)
	w := httptest.NewRecorder()
	handleTunnelSetupCreate(w, r)
	assertStatus(t, w, http.StatusBadRequest)
}

func TestTunnelSetupStatus_ReturnsJSON(t *testing.T) {
	// Isolate HOME so we don't report the developer's own state.
	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", t.TempDir())

	r := httptest.NewRequest(http.MethodGet, "/api/tunnel/setup/status", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupStatus(w, r)
	assertStatus(t, w, http.StatusOK)
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("response not JSON: %v", err)
	}
	if _, ok := got["installed"]; !ok {
		t.Errorf("expected installed field in status: %v", got)
	}
}

func TestTunnelSetupStatus_RejectsNonGET(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/api/tunnel/setup/status", nil)
	w := httptest.NewRecorder()
	handleTunnelSetupStatus(w, r)
	assertStatus(t, w, http.StatusMethodNotAllowed)
}

// Silence unused-import warning if tunnel isn't referenced elsewhere.
var _ = tunnel.ModeIDNamed
