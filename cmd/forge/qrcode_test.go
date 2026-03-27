package main

import (
	"strings"
	"testing"
)

func TestGenerateTerminalQR(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{
			name: "simple URL",
			url:  "https://example.com",
		},
		{
			name: "URL with token",
			url:  "https://abc123.trycloudflare.com?token=abc123def456",
		},
		{
			name: "long URL",
			url:  "https://very-long-subdomain-here.trycloudflare.com/path?token=a-very-long-token-value-here-1234567890",
		},
		{
			name:    "empty URL",
			url:     "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := GenerateTerminalQR(tt.url)
			if tt.wantErr {
				if err == nil {
					t.Error("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result == "" {
				t.Error("expected non-empty QR string")
			}
			// Should contain block characters
			hasBlocks := strings.ContainsAny(result, "█▀▄ ")
			if !hasBlocks {
				t.Error("QR should contain Unicode block characters")
			}
			// Should have multiple lines
			lines := strings.Split(strings.TrimSpace(result), "\n")
			if len(lines) < 10 {
				t.Errorf("QR should have at least 10 lines, got %d", len(lines))
			}
		})
	}
}

func TestQROutputIsSquarish(t *testing.T) {
	result, err := GenerateTerminalQR("https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(result), "\n")
	if len(lines) == 0 {
		t.Fatal("no output lines")
	}
	// QR codes should be roughly square (width in chars ≈ height * 2 because
	// each character is ~2x tall as wide, but we use half-block chars to pack
	// 2 vertical pixels per character, so width ≈ height in chars)
	width := len([]rune(lines[0]))
	height := len(lines)
	ratio := float64(width) / float64(height)
	// Should be between 0.5 and 3.0 (generous range)
	if ratio < 0.5 || ratio > 3.0 {
		t.Errorf("QR aspect ratio seems wrong: %dx%d (ratio %.2f)", width, height, ratio)
	}
}
