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

// ── Macro delivery (paste + Enter) tests ───────────────────────────────────

// recordedPtyWrite captures one write to the PTY together with the moment it
// happened, so a test can assert the ORDER and the SPACING of the paste and
// the Enter that submits it.
type recordedPtyWrite struct {
	payload  string
	happened time.Time
}

// redrawingPtySession is a fake terminal session that models the one
// behaviour that matters here: a TUI keeps redrawing for a short while after
// it receives a paste, and only once that redraw stops has the pasted text
// actually landed in its input box.
//
// It satisfies both halves of a PTY session (read activity + write) so the
// whole delivery path can be exercised without a real terminal.
type redrawingPtySession struct {
	mu sync.Mutex

	writes []recordedPtyWrite

	// redrawDuration is how long the fake TUI keeps producing output after a
	// paste arrives. Real CLIs spend this time rendering the
	// "[Pasted text +N lines]" placeholder.
	redrawDuration time.Duration

	// redrawingUntil is when the current burst of output stops. Zero means
	// the session has never produced output.
	redrawingUntil time.Time
}

func newRedrawingPtySession(redrawDuration time.Duration) *redrawingPtySession {
	return &redrawingPtySession{redrawDuration: redrawDuration}
}

func (session *redrawingPtySession) WriteToPty(payload []byte) (int, error) {
	session.mu.Lock()
	defer session.mu.Unlock()
	session.writes = append(session.writes, recordedPtyWrite{
		payload:  string(payload),
		happened: time.Now(),
	})
	// A paste makes the TUI redraw; a bare Enter is not modelled as output
	// because the test only cares about the window BEFORE the Enter.
	if strings.Contains(string(payload), "\x1b[200~") {
		session.redrawingUntil = time.Now().Add(session.redrawDuration)
	}
	return len(payload), nil
}

func (session *redrawingPtySession) LastOutputAt() time.Time {
	session.mu.Lock()
	defer session.mu.Unlock()
	if session.redrawingUntil.IsZero() {
		return time.Time{}
	}
	// While the burst is still running the session looks busy "right now";
	// once it ends, the last output stays pinned at the end of the burst.
	if time.Now().Before(session.redrawingUntil) {
		return time.Now()
	}
	return session.redrawingUntil
}

func (session *redrawingPtySession) IsBracketedPasteEnabled() bool { return true }

func (session *redrawingPtySession) RecentOutput() []byte { return nil }

// recordedWrites returns a copy so assertions never race the fake.
func (session *redrawingPtySession) recordedWrites() []recordedPtyWrite {
	session.mu.Lock()
	defer session.mu.Unlock()
	copied := make([]recordedPtyWrite, len(session.writes))
	copy(copied, session.writes)
	return copied
}

// TestBracketedMacroSendsPasteThenEnter pins the delivery shape: the payload
// is wrapped in bracketed-paste markers and the Enter that submits it is a
// SEPARATE write. If the Enter were folded into the paste it would become one
// more line of pasted text instead of a submit.
func TestBracketedMacroSendsPasteThenEnter(t *testing.T) {
	session := newRedrawingPtySession(0)

	if _, _, err := writeMacro(session, "line one\nline two", "bracketed"); err != nil {
		t.Fatalf("writeMacro returned an error: %v", err)
	}

	writes := session.recordedWrites()
	if len(writes) != 2 {
		t.Fatalf("expected exactly 2 writes (paste, Enter); got %d: %#v", len(writes), writes)
	}
	if !strings.HasPrefix(writes[0].payload, "\x1b[200~") || !strings.HasSuffix(writes[0].payload, "\x1b[201~") {
		t.Errorf("first write is not a bracketed paste: %q", writes[0].payload)
	}
	if strings.Contains(writes[0].payload, "\n") {
		t.Errorf("paste still contains a line feed; TUIs need CR: %q", writes[0].payload)
	}
	if writes[1].payload != "\r" {
		t.Errorf("second write should be the submitting Enter; got %q", writes[1].payload)
	}
}

// TestBracketedMacroWaitsForPasteToLandBeforeEnter is the regression guard for
// the "the card pastes but never runs" bug.
//
// A fixed pause before the Enter is a race: when the receiving CLI is still
// assembling the paste, the Enter is swallowed into it and the prompt sits in
// the input box unsent. The Enter must instead wait until the CLI has stopped
// redrawing, which is the observable proof that the paste has landed.
func TestBracketedMacroWaitsForPasteToLandBeforeEnter(t *testing.T) {
	const slowRedraw = 300 * time.Millisecond
	session := newRedrawingPtySession(slowRedraw)

	if _, _, err := writeMacro(session, "a slow-to-render payload", "bracketed"); err != nil {
		t.Fatalf("writeMacro returned an error: %v", err)
	}

	writes := session.recordedWrites()
	if len(writes) != 2 {
		t.Fatalf("expected paste then Enter; got %d writes", len(writes))
	}

	gapBeforeEnter := writes[1].happened.Sub(writes[0].happened)
	if gapBeforeEnter < slowRedraw {
		t.Fatalf(
			"Enter was sent %v after the paste, before the CLI stopped redrawing (%v) — "+
				"it would be absorbed into the paste and the prompt would never be submitted",
			gapBeforeEnter, slowRedraw,
		)
	}
}

// TestBracketedMacroEnterIsNotDelayedForeverByAChattyCli proves the wait is
// capped. A CLI that never stops printing (a spinner, a progress bar) must not
// hold the Enter indefinitely — a late submit is recoverable, a missing one is
// not.
func TestBracketedMacroEnterIsNotDelayedForeverByAChattyCli(t *testing.T) {
	session := newRedrawingPtySession(30 * time.Second)

	startedAt := time.Now()
	if _, _, err := writeMacro(session, "payload", "bracketed"); err != nil {
		t.Fatalf("writeMacro returned an error: %v", err)
	}
	elapsed := time.Since(startedAt)

	writes := session.recordedWrites()
	if len(writes) != 2 || writes[1].payload != "\r" {
		t.Fatalf("Enter was never sent to a continuously-printing CLI: %#v", writes)
	}

	const enterWaitCap = macroPostPasteMaxWaitMs * time.Millisecond
	if elapsed > enterWaitCap+(500*time.Millisecond) {
		t.Errorf("waited %v before Enter; the cap is %v", elapsed, enterWaitCap)
	}
}

// TestBracketedMacroSubmitsPromptlyWhenTheCliIsSilent guards the other edge:
// a CLI that acknowledges the paste without redrawing must still get its Enter
// quickly, so the common case does not feel sluggish.
func TestBracketedMacroSubmitsPromptlyWhenTheCliIsSilent(t *testing.T) {
	session := newRedrawingPtySession(0)

	startedAt := time.Now()
	if _, _, err := writeMacro(session, "payload", "bracketed"); err != nil {
		t.Fatalf("writeMacro returned an error: %v", err)
	}
	elapsed := time.Since(startedAt)

	const generousBudget = 750 * time.Millisecond
	if elapsed > generousBudget {
		t.Errorf("a silent CLI waited %v for its Enter; budget is %v", elapsed, generousBudget)
	}
}

// TestChunkedMacroAlsoWaitsForThePasteToLand keeps the fallback path honest:
// the CLIs that do not advertise bracketed paste have the same race.
func TestChunkedMacroAlsoWaitsForThePasteToLand(t *testing.T) {
	session := newRedrawingPtySession(0)

	if _, _, err := writeMacro(session, "one\ntwo", "chunked"); err != nil {
		t.Fatalf("writeMacro returned an error: %v", err)
	}

	writes := session.recordedWrites()
	if len(writes) == 0 {
		t.Fatal("chunked mode wrote nothing")
	}
	if writes[len(writes)-1].payload != "\r" {
		t.Errorf("chunked mode did not finish with a submitting Enter; got %q", writes[len(writes)-1].payload)
	}
}
