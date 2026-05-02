package main

import (
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// ── Mock helpers ───────────────────────────────────────────────────────────

// mockSessionOption is a functional option for building mockQuietSessions.
type mockSessionOption func(*mockQuietSession)

// sessionOutputAge sets how far in the past lastOutputAt is relative to
// when the session was constructed, and marks the session as frozen (already
// quiet) — simulating a CLI that finished its startup before the macro arrived.
func sessionOutputAge(age time.Duration) mockSessionOption {
	return func(mockSession *mockQuietSession) {
		mockSession.lastOutputAt = time.Now().Add(-age)
		mockSession.isFrozen = true
	}
}

// mockQuietSession satisfies ptyActivityReader so waitForPTYQuiet and
// pickMacroMode can be tested without a real PTY process.
type mockQuietSession struct {
	mu                      sync.Mutex
	lastOutputAt            time.Time
	isFrozen                bool // when false, LastOutputAt returns time.Now() to simulate live output
	isBracketedPasteEnabled bool
	recentOutputBytes       []byte
}

func newMockQuietSession(opts ...mockSessionOption) *mockQuietSession {
	mockSession := &mockQuietSession{}
	for _, applyOption := range opts {
		applyOption(mockSession)
	}
	return mockSession
}

// freezeOutput stops advancing lastOutputAt (simulates CLI going quiet).
func (mockSession *mockQuietSession) freezeOutput() {
	mockSession.mu.Lock()
	defer mockSession.mu.Unlock()
	mockSession.lastOutputAt = time.Now()
	mockSession.isFrozen = true
}

func (mockSession *mockQuietSession) LastOutputAt() time.Time {
	mockSession.mu.Lock()
	defer mockSession.mu.Unlock()
	// If not frozen, pretend the CLI just emitted output so the caller
	// always sees a "live" session — simulates continuous startup printing.
	if !mockSession.isFrozen {
		return time.Now()
	}
	return mockSession.lastOutputAt
}

func (mockSession *mockQuietSession) IsBracketedPasteEnabled() bool {
	mockSession.mu.Lock()
	defer mockSession.mu.Unlock()
	return mockSession.isBracketedPasteEnabled
}

func (mockSession *mockQuietSession) RecentOutput() []byte {
	mockSession.mu.Lock()
	defer mockSession.mu.Unlock()
	copied := make([]byte, len(mockSession.recentOutputBytes))
	copy(copied, mockSession.recentOutputBytes)
	return copied
}

// ── HTTP handler tests ─────────────────────────────────────────────────────

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

// ── waitForPTYQuiet behaviour ──────────────────────────────────────────────

// TestWaitForPTYQuiet_FastStartCase verifies that when a CLI finishes its
// startup banner BEFORE the macro request arrives (lastOutputAt < baseline),
// the function returns after quietMs rather than blocking until maxDelayMs.
//
// This was the primary cause of 12-second injection delays in the macro log.
func TestWaitForPTYQuiet_FastStartCase(t *testing.T) {
	mockSession := newMockQuietSession(
		// lastOutputAt is in the past, before the baseline we will set
		sessionOutputAge(200 * time.Millisecond),
	)

	quietMs := 50
	maxDelayMs := 5000 // would block 5 s in the old code
	startedAt := time.Now()
	baseline := startedAt // same as startedAt in the real handler

	start := time.Now()
	waitForPTYQuiet(mockSession, quietMs, maxDelayMs, startedAt, baseline)
	elapsed := time.Since(start)

	// Should return within quietMs + a poll tick (50 ms), not block to maxDelayMs
	if elapsed > 300*time.Millisecond {
		t.Errorf("fast-start case blocked for %v; expected ≤ 300ms (quietMs=%d)", elapsed, quietMs)
	}
}

// TestWaitForPTYQuiet_ActiveOutput verifies that when the CLI is still
// printing after the baseline, the function waits for a real quiet window.
func TestWaitForPTYQuiet_ActiveOutput(t *testing.T) {
	// Start unfrozen: LastOutputAt() returns time.Now() on every call,
	// simulating continuous CLI startup output.  After 150ms, freeze it
	// to simulate the CLI reaching its prompt.
	mockSession := newMockQuietSession() // no sessionOutputAge → isFrozen=false
	go func() {
		time.Sleep(150 * time.Millisecond)
		mockSession.freezeOutput()
	}()

	quietMs := 50
	maxDelayMs := 3000
	startedAt := time.Now()
	baseline := startedAt

	start := time.Now()
	waitForPTYQuiet(mockSession, quietMs, maxDelayMs, startedAt, baseline)
	elapsed := time.Since(start)

	// Should return after ~150ms of active output + quietMs, not instantly.
	if elapsed < 100*time.Millisecond {
		t.Errorf("active-output case returned too soon (%v); expected output to drain first", elapsed)
	}
}
