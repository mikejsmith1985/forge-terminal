package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// TestParseMacroPath documents the path-shape contract.  If this regresses,
// callers will silently land in 404 paths and the user will see the macro
// fail with no useful diagnostics.
func TestParseMacroPath(t *testing.T) {
	cases := []struct {
		path    string
		wantID  string
		wantOK  bool
	}{
		{"/api/terminal/abc-123/macro", "abc-123", true},
		{"/api/terminal/uuid-with-dashes/macro", "uuid-with-dashes", true},

		// Wrong action name — reserved so /api/terminal/{id}/something else
		// can be added later without conflicting.
		{"/api/terminal/abc/other", "", false},

		// Missing session id.
		{"/api/terminal//macro", "", false},

		// Missing trailing /macro.
		{"/api/terminal/abc", "", false},

		// Wrong prefix.
		{"/api/foo/abc/macro", "", false},

		// Extra path segments.
		{"/api/terminal/abc/macro/extra", "", false},
	}

	for _, tc := range cases {
		gotID, gotOK := parseMacroPath(tc.path)
		if gotOK != tc.wantOK {
			t.Errorf("parseMacroPath(%q) ok=%v want %v", tc.path, gotOK, tc.wantOK)
		}
		if gotID != tc.wantID {
			t.Errorf("parseMacroPath(%q) id=%q want %q", tc.path, gotID, tc.wantID)
		}
	}
}

// TestHandleMacro_RejectsNonPost guards against accidental GET requests
// silently triggering a side-effect.  The macro is intentionally POST-only.
func TestHandleMacro_RejectsNonPost(t *testing.T) {
	for _, method := range []string{"GET", "PUT", "DELETE", "PATCH"} {
		req := httptest.NewRequest(method, "/api/terminal/abc/macro", nil)
		rec := httptest.NewRecorder()
		handleMacro(rec, req)
		if rec.Code != 405 {
			t.Errorf("method %s: want 405, got %d", method, rec.Code)
		}
	}
}

// TestHandleMacro_BadJSON returns 400 for malformed bodies — used by the
// frontend to surface "your macro card is broken" rather than a generic
// network error.
func TestHandleMacro_BadJSON(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/terminal/abc/macro", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()
	handleMacro(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400, got %d (body=%s)", rec.Code, rec.Body.String())
	}
}

// TestHandleMacro_EmptyPayload is a deliberate guard — the legacy bug
// shipped empty payloads silently because the JSON did parse.  We catch
// this at the boundary so the user sees a real error.
func TestHandleMacro_EmptyPayload(t *testing.T) {
	req := httptest.NewRequest("POST", "/api/terminal/abc/macro", strings.NewReader(`{"payload":""}`))
	rec := httptest.NewRecorder()
	handleMacro(rec, req)
	if rec.Code != 400 {
		t.Fatalf("want 400, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "payload is required") {
		t.Errorf("expected error message about payload, got: %s", rec.Body.String())
	}
}
