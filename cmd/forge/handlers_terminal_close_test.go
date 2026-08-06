// handlers_terminal_close_test.go guards the endpoint that reclaims a shell when
// the user closes its tab. Because an unattended PTY now survives a full day,
// this is the only path that frees a deliberately closed session — if it stops
// working, every closed tab leaks a live shell process.
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// postTerminalClose runs the handler against a request body and returns the recorder.
func postTerminalClose(body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/terminal/close", strings.NewReader(body))
	recorder := httptest.NewRecorder()
	handleTerminalClose(recorder, request)
	return recorder
}

func TestHandleTerminalClose_RejectsNonPost(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/terminal/close", nil)
	recorder := httptest.NewRecorder()

	handleTerminalClose(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET should be rejected, got status %d", recorder.Code)
	}
}

func TestHandleTerminalClose_RequiresSessionID(t *testing.T) {
	if recorder := postTerminalClose(`{}`); recorder.Code != http.StatusBadRequest {
		t.Errorf("missing sessionId should be rejected, got status %d", recorder.Code)
	}
	if recorder := postTerminalClose(`not json`); recorder.Code != http.StatusBadRequest {
		t.Errorf("malformed body should be rejected, got status %d", recorder.Code)
	}
}

// TestHandleTerminalClose_UnknownSessionSucceeds keeps tab teardown best-effort:
// the frontend fires this during unmount and must never have to handle an error.
func TestHandleTerminalClose_UnknownSessionSucceeds(t *testing.T) {
	recorder := postTerminalClose(`{"sessionId":"tab-that-never-existed"}`)

	if recorder.Code != http.StatusOK {
		t.Errorf("closing an unknown session should succeed, got status %d", recorder.Code)
	}
	if body := recorder.Body.String(); !strings.Contains(body, `"closed":false`) {
		t.Errorf("expected the response to report nothing was closed, got %q", body)
	}
}
