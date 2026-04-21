// handlers_mobile_test.go tests the mobile API handler helpers.
//
// Full integration tests (routing, token auth over HTTP) are covered by
// end-to-end tests in tests/. This file tests the pure logic helpers that
// do not require a running HTTP server or terminal sessions.
package main

import (
	"net/http"
	"net/http/httptest"
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
