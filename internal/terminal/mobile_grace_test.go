package terminal

import (
	"testing"
	"time"
)

func TestIsMobileClient(t *testing.T) {
	tests := []struct {
		name      string
		userAgent string
		want      bool
	}{
		{"iPhone Safari", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15", true},
		{"Android Chrome", "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile", true},
		{"iPad Safari", "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15", true},
		{"Android tablet", "Mozilla/5.0 (Linux; Android 13; SM-X800) AppleWebKit/537.36 Chrome/112.0.0.0 Safari/537.36", false},
		{"Windows Chrome", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0", false},
		{"Mac Safari", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", false},
		{"empty UA", "", false},
		{"curl", "curl/7.88.1", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsMobileClient(tt.userAgent)
			if got != tt.want {
				t.Errorf("IsMobileClient(%q) = %v, want %v", tt.userAgent, got, tt.want)
			}
		})
	}
}

func TestGracePeriodForClient(t *testing.T) {
	tests := []struct {
		name      string
		userAgent string
		want      time.Duration
	}{
		{"desktop gets default", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", sessionGracePeriod},
		{"mobile gets extended", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)", mobileGracePeriod},
		{"empty gets default", "", sessionGracePeriod},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GracePeriodForClient(tt.userAgent)
			if got != tt.want {
				t.Errorf("GracePeriodForClient(%q) = %v, want %v", tt.userAgent, got, tt.want)
			}
		})
	}
}

// The exact retention values are no longer pinned here. What matters is the
// user-facing rule — a session outlives any disconnect until the user closes
// its tab — which is asserted in session_retention_test.go.
