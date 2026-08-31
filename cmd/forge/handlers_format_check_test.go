// handlers_format_check_test.go — the advisory endpoint's contract.
//
// The behaviour worth pinning is that a quiet or unknown session answers
// normally rather than erroring. A client that had to distinguish "nothing to
// report" from "something went wrong" would end up ignoring both.
package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFormatCheckReportsNothingForAnUnknownSession(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/format-check?sessionId=no-such-session", nil)

	handleFormatCheck(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("an unknown session is not an error: want 200, got %d", recorder.Code)
	}

	var body struct {
		ShouldWarn bool `json:"shouldWarn"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response should be valid JSON, got: %s", recorder.Body.String())
	}
	if body.ShouldWarn {
		t.Error("a session that has said nothing must not be warned about")
	}
}

func TestFormatCheckRejectsAWrongMethod(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/format-check", nil)

	handleFormatCheck(recorder, request)

	if recorder.Code != http.StatusMethodNotAllowed {
		t.Errorf("want 405, got %d", recorder.Code)
	}
}

func TestFormatCheckNeverReportsABlockingOutcome(t *testing.T) {
	// The endpoint exposes shouldWarn and nothing stronger. If a blocking field
	// is ever added, this test is where the argument for it should happen
	// rather than it appearing quietly — the verdict is drawn from screen
	// redraws and cannot carry that weight.
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/format-check?sessionId=any", nil)

	handleFormatCheck(recorder, request)

	var body map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decoding: %v", err)
	}

	for _, forbiddenField := range []string{"shouldBlock", "blocked", "reject"} {
		if _, exists := body[forbiddenField]; exists {
			t.Errorf("the advisory endpoint must not expose %q", forbiddenField)
		}
	}
}
