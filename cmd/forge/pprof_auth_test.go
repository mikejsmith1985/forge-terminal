package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPprofAuthMiddleware(t *testing.T) {
	const testToken = "test-secret-token-12345"

	tests := []struct {
		name       string
		token      string // globalToken value ("" = auth disabled)
		queryToken string
		bearer     string
		wantStatus int
	}{
		{
			name:       "no auth required when globalToken empty",
			token:      "",
			wantStatus: http.StatusOK,
		},
		{
			name:       "reject when auth enabled but no token provided",
			token:      testToken,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "accept valid query param token",
			token:      testToken,
			queryToken: testToken,
			wantStatus: http.StatusOK,
		},
		{
			name:       "accept valid Bearer header",
			token:      testToken,
			bearer:     testToken,
			wantStatus: http.StatusOK,
		},
		{
			name:       "reject invalid token",
			token:      testToken,
			queryToken: "wrong-token",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Set global auth state
			origToken := globalToken
			globalToken = tt.token
			defer func() { globalToken = origToken }()

			// Build a mux with the auth-wrapped pprof handlers
			mux := NewPprofMux()
			ts := httptest.NewServer(mux)
			defer ts.Close()

			url := ts.URL + "/debug/pprof/"
			if tt.queryToken != "" {
				url += "?token=" + tt.queryToken
			}

			req, err := http.NewRequest("GET", url, nil)
			if err != nil {
				t.Fatalf("failed to create request: %v", err)
			}
			if tt.bearer != "" {
				req.Header.Set("Authorization", "Bearer "+tt.bearer)
			}

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tt.wantStatus {
				t.Errorf("got status %d, want %d", resp.StatusCode, tt.wantStatus)
			}
		})
	}
}
