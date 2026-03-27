package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// nopHandler is a no-op handler used as the inner handler for middleware tests.
func nopHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// --- SecureHeaders tests ---

func TestSecureHeaders_CSPIncludesTunnelDomains(t *testing.T) {
	handler := SecureHeaders(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "wss:") {
		t.Errorf("CSP missing wss: directive, got: %s", csp)
	}
	if !strings.Contains(csp, "https://*.trycloudflare.com") {
		t.Errorf("CSP missing trycloudflare.com tunnel domain, got: %s", csp)
	}
}

func TestSecureHeaders_XFrameOptionsSameOrigin(t *testing.T) {
	handler := SecureHeaders(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("X-Frame-Options")
	if got != "SAMEORIGIN" {
		t.Errorf("X-Frame-Options = %q, want SAMEORIGIN", got)
	}
}

func TestSecureHeaders_XContentTypeOptionsNosniff(t *testing.T) {
	handler := SecureHeaders(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("X-Content-Type-Options")
	if got != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", got)
	}
}

func TestSecureHeaders_XSSProtectionSet(t *testing.T) {
	handler := SecureHeaders(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("X-XSS-Protection")
	if got != "1; mode=block" {
		t.Errorf("X-XSS-Protection = %q, want '1; mode=block'", got)
	}
}

func TestSecureHeaders_CSPAllowsSelfAndInlineStyles(t *testing.T) {
	handler := SecureHeaders(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	csp := rec.Header().Get("Content-Security-Policy")
	if !strings.Contains(csp, "style-src 'self' 'unsafe-inline'") {
		t.Errorf("CSP style-src missing 'self' 'unsafe-inline', got: %s", csp)
	}
}

// --- CORSMiddleware tests ---

func TestCORSMiddleware_AllowsConfiguredOrigin(t *testing.T) {
	os.Setenv("ALLOWED_ORIGINS", "https://example.com,https://other.com")
	defer os.Unsetenv("ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("Access-Control-Allow-Origin")
	if got != "https://example.com" {
		t.Errorf("Access-Control-Allow-Origin = %q, want https://example.com", got)
	}
}

func TestCORSMiddleware_RejectsUnconfiguredOrigin(t *testing.T) {
	os.Setenv("ALLOWED_ORIGINS", "https://example.com")
	defer os.Unsetenv("ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://evil.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("Access-Control-Allow-Origin")
	if got != "" {
		t.Errorf("Access-Control-Allow-Origin should be empty for rejected origin, got: %q", got)
	}
}

func TestCORSMiddleware_WildcardAllowsAll(t *testing.T) {
	os.Setenv("ALLOWED_ORIGINS", "*")
	defer os.Unsetenv("ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://anything.example.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	got := rec.Header().Get("Access-Control-Allow-Origin")
	if got != "https://anything.example.com" {
		t.Errorf("Access-Control-Allow-Origin = %q, want https://anything.example.com", got)
	}
}

func TestCORSMiddleware_PreflightReturnsCorrectHeaders(t *testing.T) {
	os.Setenv("ALLOWED_ORIGINS", "https://example.com")
	defer os.Unsetenv("ALLOWED_ORIGINS")

	handler := CORSMiddleware(http.HandlerFunc(nopHandler))
	req := httptest.NewRequest(http.MethodOptions, "/", nil)
	req.Header.Set("Origin", "https://example.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("preflight status = %d, want %d", rec.Code, http.StatusOK)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Error("preflight missing Access-Control-Allow-Methods")
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Error("preflight missing Access-Control-Allow-Headers")
	}
	if got := rec.Header().Get("Access-Control-Max-Age"); got != "3600" {
		t.Errorf("Access-Control-Max-Age = %q, want 3600", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Errorf("Access-Control-Allow-Credentials = %q, want true", got)
	}
}

// --- WrapWithMiddleware tests ---

func TestWrapWithMiddleware_ChainsAllMiddleware(t *testing.T) {
	// Clear auth token so AuthMiddleware passes through
	originalToken := globalToken
	globalToken = ""
	defer func() { globalToken = originalToken }()

	os.Setenv("ALLOWED_ORIGINS", "*")
	defer os.Unsetenv("ALLOWED_ORIGINS")

	called := false
	inner := func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	}

	handler := WrapWithMiddleware(inner)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Origin", "https://test.com")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !called {
		t.Error("inner handler was not called — middleware chain is broken")
	}
	// CORS header (from CORSMiddleware)
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://test.com" {
		t.Errorf("missing CORS header, Access-Control-Allow-Origin = %q", got)
	}
	// Security header (from SecureHeaders)
	if got := rec.Header().Get("X-Frame-Options"); got != "SAMEORIGIN" {
		t.Errorf("missing security header, X-Frame-Options = %q", got)
	}
	if got := rec.Header().Get("Content-Security-Policy"); got == "" {
		t.Error("missing Content-Security-Policy header")
	}
}
