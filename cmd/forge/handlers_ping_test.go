package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestHandlePing_NoAuth_Returns200JSON is the contract test for the named-
// tunnel supervisor's health probe.  If this ever regresses, every named
// tunnel in the wild will get stuck in the Degraded state.
func TestHandlePing_NoAuth_Returns200JSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/ping", nil)
	rec := httptest.NewRecorder()

	handlePing(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("expected application/json content type, got %q", contentType)
	}

	body := rec.Body.String()
	if body != pingResponseBody {
		t.Fatalf("unexpected body: got %q want %q", body, pingResponseBody)
	}

	cacheControl := rec.Header().Get("Cache-Control")
	if cacheControl != "no-store" {
		t.Fatalf("expected Cache-Control no-store, got %q", cacheControl)
	}
}

// TestHandlePing_AcceptsAnyMethod ensures HEAD/POST also work — the supervisor
// uses GET today but cloudflared occasionally sends HEAD as a pre-check, and
// we do not want a 405 to count as a probe failure.
func TestHandlePing_AcceptsAnyMethod(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodPost} {
		req := httptest.NewRequest(method, "/api/ping", nil)
		rec := httptest.NewRecorder()

		handlePing(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("method %s: expected 200, got %d", method, rec.Code)
		}
	}
}
