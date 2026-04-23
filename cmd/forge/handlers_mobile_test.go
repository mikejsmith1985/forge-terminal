// handlers_mobile_test.go tests the mobile API handler helpers.
//
// Full integration tests (routing, token auth over HTTP) are covered by
// end-to-end tests in tests/. This file tests the pure logic helpers that
// do not require a running HTTP server or terminal sessions.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── ANSI Stripping Tests ──────────────────────────────────────────────────────

func TestStripANSICodes_PlainText(t *testing.T) {
	input := "hello world\n"
	output := stripANSICodes(input)
	if output != input {
		t.Errorf("plain text should pass through unchanged: got %q", output)
	}
}

func TestStripANSICodes_RemovesColourSequences(t *testing.T) {
	// A typical coloured prompt: \x1b[32m means green, \x1b[0m resets.
	colouredInput := "\x1b[32mhello\x1b[0m world"
	expectedOutput := "hello world"

	strippedOutput := stripANSICodes(colouredInput)
	if strippedOutput != expectedOutput {
		t.Errorf("expected %q, got %q", expectedOutput, strippedOutput)
	}
}

func TestStripANSICodes_RemovesOSCSequences(t *testing.T) {
	// OSC sequences are used for window titles: \x1b]0;My Title\x07
	oscInput := "\x1b]0;My Terminal Title\x07hello"
	expectedOutput := "hello"

	strippedOutput := stripANSICodes(oscInput)
	if strippedOutput != expectedOutput {
		t.Errorf("expected %q, got %q", expectedOutput, strippedOutput)
	}
}

func TestStripANSICodes_RemovesCursorMovement(t *testing.T) {
	// CSI H (cursor home), CSI J (erase screen), then actual content.
	cursorSequence := "\x1b[H\x1b[Jhello"
	expectedOutput := "hello"

	strippedOutput := stripANSICodes(cursorSequence)
	if strippedOutput != expectedOutput {
		t.Errorf("expected %q, got %q", expectedOutput, strippedOutput)
	}
}

func TestStripANSICodes_HandlesMultilineOutput(t *testing.T) {
	// Realistic terminal output with line endings and colour codes.
	multilineInput := "\x1b[1;32m$\x1b[0m ls -la\n\x1b[34mtotal 8\x1b[0m\n"
	strippedOutput := stripANSICodes(multilineInput)

	if strings.Contains(strippedOutput, "\x1b") {
		t.Errorf("output should not contain any escape characters, got: %q", strippedOutput)
	}
	if !strings.Contains(strippedOutput, "ls -la") {
		t.Errorf("command text should be preserved, got: %q", strippedOutput)
	}
}

func TestStripANSICodes_EmptyString(t *testing.T) {
	if result := stripANSICodes(""); result != "" {
		t.Errorf("empty input should produce empty output, got: %q", result)
	}
}

// ── CORS Header Tests ─────────────────────────────────────────────────────────

func TestAddMobileCORSHeaders_SetsRequiredHeaders(t *testing.T) {
	responseRecorder := httptest.NewRecorder()
	addMobileCORSHeaders(responseRecorder)

	if got := responseRecorder.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("expected Access-Control-Allow-Origin: *, got: %q", got)
	}
	if got := responseRecorder.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Error("expected Access-Control-Allow-Methods header to be set")
	}
	if got := responseRecorder.Header().Get("Access-Control-Allow-Headers"); got == "" {
		t.Error("expected Access-Control-Allow-Headers header to be set")
	}
}

func TestHandleMobileCORSPreflight_ReturnsTrueForOptions(t *testing.T) {
	responseRecorder := httptest.NewRecorder()
	optionsRequest := httptest.NewRequest(http.MethodOptions, "/api/mobile/info", nil)

	wasPreflight := handleMobileCORSPreflight(responseRecorder, optionsRequest)
	if !wasPreflight {
		t.Error("OPTIONS request should be detected as preflight")
	}
	if responseRecorder.Code != http.StatusNoContent {
		t.Errorf("preflight should respond 204, got: %d", responseRecorder.Code)
	}
}

func TestHandleMobileCORSPreflight_ReturnsFalseForGET(t *testing.T) {
	responseRecorder := httptest.NewRecorder()
	getRequest := httptest.NewRequest(http.MethodGet, "/api/mobile/info", nil)

	wasPreflight := handleMobileCORSPreflight(responseRecorder, getRequest)
	if wasPreflight {
		t.Error("GET request should not be detected as preflight")
	}
}

// ── Token Validation Tests ────────────────────────────────────────────────────

func TestValidateMobileRequest_RejectsMissingToken(t *testing.T) {
	// Temporarily set a token so the handler doesn't return 503.
	originalToken := activeMobileToken
	activeMobileToken = "test-token-abc123"
	defer func() { activeMobileToken = originalToken }()

	responseRecorder := httptest.NewRecorder()
	requestWithNoAuth := httptest.NewRequest(http.MethodGet, "/api/mobile/info", nil)

	isValid := validateMobileRequest(responseRecorder, requestWithNoAuth)
	if isValid {
		t.Error("request without Authorization header should be rejected")
	}
	if responseRecorder.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got: %d", responseRecorder.Code)
	}
}

func TestValidateMobileRequest_RejectsWrongToken(t *testing.T) {
	originalToken := activeMobileToken
	activeMobileToken = "correct-token-xyz"
	defer func() { activeMobileToken = originalToken }()

	responseRecorder := httptest.NewRecorder()
	requestWithWrongToken := httptest.NewRequest(http.MethodGet, "/api/mobile/info", nil)
	requestWithWrongToken.Header.Set("Authorization", "Bearer wrong-token-abc")

	isValid := validateMobileRequest(responseRecorder, requestWithWrongToken)
	if isValid {
		t.Error("request with wrong token should be rejected")
	}
	if responseRecorder.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got: %d", responseRecorder.Code)
	}
}

func TestValidateMobileRequest_AcceptsCorrectToken(t *testing.T) {
	const correctToken = "valid-test-token-0123456789abcdef"
	originalToken := activeMobileToken
	activeMobileToken = correctToken
	defer func() { activeMobileToken = originalToken }()

	responseRecorder := httptest.NewRecorder()
	requestWithCorrectToken := httptest.NewRequest(http.MethodGet, "/api/mobile/info", nil)
	requestWithCorrectToken.Header.Set("Authorization", "Bearer "+correctToken)

	isValid := validateMobileRequest(responseRecorder, requestWithCorrectToken)
	if !isValid {
		t.Error("request with correct token should be accepted")
	}
}

// ── Tab Title Index Tests ─────────────────────────────────────────────────────

// writeTestSessionsFile creates a sessions.json file at the path Forge expects
// inside a temporary home directory. Returns the temp dir for cleanup via t.TempDir.
func writeTestSessionsFile(t *testing.T, sessions any) string {
	t.Helper()

	tempHome := t.TempDir()
	t.Setenv("USERPROFILE", tempHome) // Windows: os.UserHomeDir() checks USERPROFILE first
	t.Setenv("HOME", tempHome)        // Unix fallback

	sessionDir := filepath.Join(tempHome, ".forge", "terminal")
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("could not create temp session dir: %v", err)
	}

	rawJSON, err := json.Marshal(sessions)
	if err != nil {
		t.Fatalf("could not marshal test sessions: %v", err)
	}

	sessionsFilePath := filepath.Join(sessionDir, "sessions.json")
	if err := os.WriteFile(sessionsFilePath, rawJSON, 0o600); err != nil {
		t.Fatalf("could not write sessions.json: %v", err)
	}

	return tempHome
}

func TestBuildTabTitleIndex_ReturnsMatchingTitle(t *testing.T) {
	writeTestSessionsFile(t, map[string]any{
		"tabs": []map[string]any{
			{"id": "tab-4-uajzit", "title": "forge-terminal"},
		},
		"activeTabId": "tab-4-uajzit",
	})

	titleMap := buildTabTitleIndex()

	if got := titleMap["tab-4-uajzit"]; got != "forge-terminal" {
		t.Errorf("expected title %q for known tab ID, got %q", "forge-terminal", got)
	}
}

func TestBuildTabTitleIndex_ReturnsEmptyForUnknownTabID(t *testing.T) {
	writeTestSessionsFile(t, map[string]any{
		"tabs": []map[string]any{
			{"id": "tab-known", "title": "some-project"},
		},
		"activeTabId": "tab-known",
	})

	titleMap := buildTabTitleIndex()

	if got, exists := titleMap["tab-unknown-xyz"]; exists {
		t.Errorf("unknown tab ID should not be in the map, but got %q", got)
	}
}

func TestBuildTabTitleIndex_SkipsTabsWithEmptyTitle(t *testing.T) {
	writeTestSessionsFile(t, map[string]any{
		"tabs": []map[string]any{
			{"id": "tab-no-title", "title": ""},
		},
		"activeTabId": "tab-no-title",
	})

	titleMap := buildTabTitleIndex()

	if got, exists := titleMap["tab-no-title"]; exists {
		t.Errorf("tab with empty title should not appear in the map, but got %q", got)
	}
}

func TestBuildTabTitleIndex_ReturnsEmptyMapWhenSessionsFileMissing(t *testing.T) {
	// Point HOME at an empty temp dir so sessions.json does not exist.
	tempHome := t.TempDir()
	t.Setenv("USERPROFILE", tempHome)
	t.Setenv("HOME", tempHome)

	titleMap := buildTabTitleIndex()

	// The function must not panic or return nil — it returns an empty map.
	if titleMap == nil {
		t.Error("expected an empty (non-nil) map when sessions.json is missing")
	}
	if len(titleMap) != 0 {
		t.Errorf("expected empty map when no sessions file exists, got %d entries", len(titleMap))
	}
}
